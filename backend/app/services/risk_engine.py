from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from decimal import Decimal
import re
from ..models import Blacklist, ScamPattern, Transaction, TrustedRecipient
import numpy as np

@dataclass
class RiskResult:
    ml_score: Optional[float]
    rule_score: float
    final_score: float
    level: str  # low/medium/high/critical
    reason: str
    matched_blacklist: List[Dict]
    matched_patterns: List[Dict]

class RiskEngine:
    """
    Engine tính điểm rủi ro kết hợp:
    1. Blacklist matching (Rule-based)
    2. Pattern matching (Keywords + Regex)
    3. ML Scoring (Heuristic + Statistical)
    4. Trusted recipient check
    """
    
    # Ngưỡng rủi ro
    THRESHOLDS = {
        "low": 0.30,
        "medium": 0.50,
        "high": 0.75,
        "critical": 0.90
    }
    
    # Trọng số
    WEIGHTS = {
        "blacklist": 0.40,
        "pattern": 0.30,
        "ml": 0.20,
        "behavior": 0.10
    }
    
    def __init__(self, db: Session):
        self.db = db
    
    async def calculate_risk(
        self,
        user_id: str,
        recipient_account: str,
        recipient_bank: Optional[str],
        amount: Decimal,
        description: Optional[str]
    ) -> RiskResult:
        """
        Tính toán điểm rủi ro tổng hợp.
        KHÔNG dùng LLM để bịa dữ liệu — chỉ dùng dữ liệu thực từ DB.
        """
        
        # 1. Kiểm tra Blacklist (từ file Excel + admin input)
        blacklist_matches = self._check_blacklist(recipient_account, recipient_bank)
        blacklist_score = self._calculate_blacklist_score(blacklist_matches)
        
        # 2. Pattern matching (scam keywords, regex)
        pattern_matches = self._check_patterns(description, recipient_account)
        pattern_score = self._calculate_pattern_score(pattern_matches)
        
        # 3. ML Heuristic (statistical analysis)
        ml_score = self._ml_heuristic_analysis(
            user_id=user_id,
            amount=amount,
            recipient_account=recipient_account,
            description=description
        )
        
        # 4. Behavioral analysis (lịch sử giao dịch user)
        behavior_score = self._behavioral_analysis(user_id, amount, recipient_account)
        
        # 5. Kiểm tra trusted recipient (giảm rủi ro nếu đã tin cậy)
        trust_factor = self._check_trusted_recipient(user_id, recipient_account, recipient_bank)
        
        # Tính điểm tổng hợp có trọng số
        raw_score = (
            blacklist_score * self.WEIGHTS["blacklist"] +
            pattern_score * self.WEIGHTS["pattern"] +
            (ml_score or 0) * self.WEIGHTS["ml"] +
            behavior_score * self.WEIGHTS["behavior"]
        )
        
        # Áp dụng trust factor (giảm rủi ro nếu người nhận tin cậy)
        final_score = max(0.0, raw_score * (1 - trust_factor))
        
        # Xác định mức độ
        level = self._determine_level(final_score)
        
        # Tạo lý do cảnh báo (có căn cứ, không bịa)
        reason = self._generate_reason(
            level, blacklist_matches, pattern_matches, 
            ml_score, behavior_score, trust_factor
        )
        
        return RiskResult(
            ml_score=round(ml_score, 3) if ml_score else None,
            rule_score=round(max(blacklist_score, pattern_score), 3),
            final_score=round(final_score, 3),
            level=level,
            reason=reason,
            matched_blacklist=[{
                "entity": m.entity_value,
                "type": m.entity_type,
                "source": m.source,
                "risk": float(m.risk_score),
                "evidence": m.evidence
            } for m in blacklist_matches],
            matched_patterns=[{
                "name": p.pattern_name,
                "description": p.description,
                "weight": float(p.risk_weight)
            } for p in pattern_matches]
        )
    
    def _check_blacklist(self, account: str, bank: Optional[str]) -> List[Blacklist]:
        """Kiểm tra account/bank có trong blacklist không — tìm kiếm linh hoạt"""
        # Chuẩn hóa input
        account_clean = str(account).replace(' ', '').strip() if account else ''
        
        query = self.db.query(Blacklist).filter(
            Blacklist.is_active == True,
            Blacklist.entity_type == "account"
        )
        
        matches = []
        
        # 1. Match chính xác (sau khi clean)
        exact = query.filter(Blacklist.entity_value == account_clean).all()
        matches.extend(exact)
        
        # 2. Match với khoảng trắng (nếu input có space)
        if ' ' in str(account):
            with_space = query.filter(Blacklist.entity_value == str(account).strip()).all()
            matches.extend(with_space)
        
        # 3. Match chứa substring (cho trường hợp STK dài, chỉ nhập một phần)
        # Chỉ áp dụng nếu account >= 6 ký tự để tránh match quá rộng
        if len(account_clean) >= 6:
            contains = query.filter(
                Blacklist.entity_value.contains(account_clean)
            ).all()
            matches.extend(contains)
        
        # 4. Match theo bank nếu có
        if bank:
            bank_match = query.filter(
                Blacklist.evidence['ngan_hang'].astext.ilike(f"%{bank}%")
            ).all()
            matches.extend(bank_match)
        
        # Loại bỏ trùng lặp theo ID
        seen = set()
        unique_matches = []
        for m in matches:
            if m.id not in seen:
                seen.add(m.id)
                unique_matches.append(m)
        
        return unique_matches    
        """Kiểm tra account/bank có trong blacklist không"""
        query = self.db.query(Blacklist).filter(
            Blacklist.is_active == True
        )
        
        # Match chính xác account
        exact_match = query.filter(Blacklist.entity_value == account).all()
        
        # Match fuzzy (chứa substring)
        fuzzy_match = query.filter(
            Blacklist.entity_value.contains(account)
        ).all()
        
        # Match theo bank nếu có
        if bank:
            bank_match = query.filter(
                Blacklist.evidence["ngan_hang"].astext.ilike(f"%{bank}%")
            ).all()
            return list({m.id: m for m in exact_match + fuzzy_match + bank_match}.values())
        
        return list({m.id: m for m in exact_match + fuzzy_match}.values())
    
    def _calculate_blacklist_score(self, matches: List[Blacklist]) -> float:
        """Tính điểm rủi ro từ blacklist matches"""
        if not matches:
            return 0.0
        
        # Lấy điểm cao nhất từ các match
        max_score = max(float(m.risk_score) for m in matches)
        
        # Nếu match nhiều nguồn -> tăng điểm
        source_count = len(set(m.source for m in matches))
        multiplier = 1.0 + (source_count - 1) * 0.1
        
        return min(1.0, max_score * multiplier)
    
    def _check_patterns(self, description: Optional[str], account: str) -> List[ScamPattern]:
        """Kiểm tra mô tả giao dịch khớp với pattern lừa đảo nào"""
        if not description:
            return []
        
        desc_lower = description.lower()
        patterns = self.db.query(ScamPattern).filter(ScamPattern.is_active == True).all()
        
        matched = []
        for pattern in patterns:
            # Kiểm tra keywords
            if pattern.keywords:
                if any(kw.lower() in desc_lower for kw in pattern.keywords):
                    matched.append(pattern)
                    continue
            
            # Kiểm tra regex patterns nếu có
            # (có thể mở rộng thêm)
        
        return matched
    
    def _calculate_pattern_score(self, matches: List[ScamPattern]) -> float:
        """Tính điểm từ pattern matches"""
        if not matches:
            return 0.0
        
        total_weight = sum(float(p.risk_weight) for p in matches)
        return min(1.0, total_weight)
    
    def _ml_heuristic_analysis(
        self,
        user_id: str,
        amount: Decimal,
        recipient_account: str,
        description: Optional[str]
    ) -> Optional[float]:
        """
        Phân tích heuristic dựa trên dữ liệu lịch sử.
        Không dùng LLM — dùng thống kê và rule.
        """
        # Lấy lịch sử giao dịch của user
        history = self.db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.status == "completed"
        ).order_by(Transaction.created_at.desc()).limit(50).all()
        
        if not history:
            # User mới -> rủi ro trung bình
            return 0.40
        
        scores = []
        
        # 1. Anomaly detection: số tiền bất thường
        amounts = [float(h.amount) for h in history]
        avg_amount = np.mean(amounts)
        std_amount = np.std(amounts) if len(amounts) > 1 else avg_amount * 0.5
        
        current_amount = float(amount)
        if std_amount > 0:
            z_score = abs(current_amount - avg_amount) / std_amount
            if z_score > 3:
                scores.append(0.80)  # Bất thường cao
            elif z_score > 2:
                scores.append(0.50)
            else:
                scores.append(0.10)
        else:
            scores.append(0.10)
        
        # 2. Frequency: người nhận mới
        known_recipients = set(h.recipient_account for h in history)
        if recipient_account not in known_recipients:
            scores.append(0.60)  # Người nhận mới = rủi ro cao hơn
        else:
            scores.append(0.05)
        
        # 3. Time-based: giao dịch đêm khuya (nếu có timestamp)
        # (Có thể mở rộng)
        
        # 4. Description analysis: các từ khóa nguy hiểm
        danger_keywords = ["khẩn cấp", "nhanh", "gấp", "bí mật", "không được nói", "thưởng", "trúng thưởng"]
        if description:
            desc_lower = description.lower()
            danger_count = sum(1 for kw in danger_keywords if kw in desc_lower)
            scores.append(min(0.90, danger_count * 0.25))
        else:
            scores.append(0.0)
        
        return round(np.mean(scores), 3) if scores else 0.30
    
    def _behavioral_analysis(self, user_id: str, amount: Decimal, recipient_account: str) -> float:
        """Phân tích hành vi người dùng"""
        # Đếm số giao dịch bị hủy/cảnh báo gần đây
        recent_flagged = self.db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.created_at >= func.now() - func.interval('7 days'),
            Transaction.risk_level.in_(["high", "critical"])
        ).count()
        
        if recent_flagged >= 3:
            return 0.70  # User có nhiều giao dịch rủi ro gần đây
        elif recent_flagged >= 1:
            return 0.30
        
        return 0.05
    
    def _check_trusted_recipient(
        self, 
        user_id: str, 
        account: str, 
        bank: Optional[str]
    ) -> float:
        """Kiểm tra người nhận có trong danh sách tin cậy không"""
        query = self.db.query(TrustedRecipient).filter(
            TrustedRecipient.user_id == user_id,
            TrustedRecipient.account_number == account
        )
        
        if bank:
            query = query.filter(TrustedRecipient.bank_code == bank)
        
        trusted = query.first()
        
        if trusted:
            return 0.50  # Giảm 50% rủi ro nếu tin cậy
        
        return 0.0
    
    def _determine_level(self, score: float) -> str:
        """Xác định mức độ rủi ro"""
        if score >= self.THRESHOLDS["critical"]:
            return "critical"
        elif score >= self.THRESHOLDS["high"]:
            return "high"
        elif score >= self.THRESHOLDS["medium"]:
            return "medium"
        else:
            return "low"
    
    def _generate_reason(
        self,
        level: str,
        blacklist_matches: List[Blacklist],
        pattern_matches: List[ScamPattern],
        ml_score: Optional[float],
        behavior_score: float,
        trust_factor: float
    ) -> str:
        """
        Tạo lý do cảnh báo DỰA TRÊN DỮ LIỆU THỰC.
        Không dùng LLM để bịa — chỉ liệt kê facts.
        """
        reasons = []
        
        if blacklist_matches:
            entities = [f"{m.entity_value} ({m.entity_type})" for m in blacklist_matches[:3]]
            reasons.append(f"Tài khoản khớp với blacklist: {', '.join(entities)}")
        
        if pattern_matches:
            patterns = [p.pattern_name for p in pattern_matches[:3]]
            reasons.append(f"Phát hiện pattern lừa đảo: {', '.join(patterns)}")
        
        if ml_score and ml_score > 0.5:
            reasons.append(f"Phân tích ML phát hiện bất thường (score: {ml_score})")
        
        if behavior_score > 0.3:
            reasons.append("Lịch sử giao dịch gần đây có nhiều cảnh báo")
        
        if trust_factor > 0:
            reasons.append("Người nhận nằm trong danh sách tin cậy (đã giảm rủi ro)")
        
        if not reasons:
            return "Không phát hiện yếu tố rủi ro đáng kể."
        
        return " | ".join(reasons)