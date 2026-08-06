import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { transactionApi } from '../api/transactionApi';
import LoadingSpinner from '../components/Common/LoadingSpinner';

export default function Intervention() {
  const { txId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  // Bắt đầu luồng can thiệp
  useEffect(() => {
    startIntervention();
  }, [txId]);

  const startIntervention = async () => {
    setLoading(true);
    try {
      const res = await transactionApi.intervene(txId);
      setStep(res.data);
      setHistory(prev => [...prev, res.data]);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không thể tải luồng can thiệp');
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (action) => {
    if (action === 'Hủy giao dịch' || action === '❌ Hủy giao dịch để an toàn') {
      try {
        await transactionApi.decide(txId, { decision: 'cancelled' });
        alert('🛡️ Giao dịch đã bị hủy để bảo vệ bạn.');
        navigate('/history');
        return;
      } catch (err) {
        setError('Không thể hủy: ' + err.response?.data?.detail);
        return;
      }
    }

    if (action === '✅ Tôi chấp nhận rủi ro, tiếp tục chuyển tiền') {
      try {
        await transactionApi.decide(txId, { decision: 'confirmed' });
        alert('✅ Bạn đã chấp nhận rủi ro. Giao dịch đang được xử lý.');
        navigate('/history');
        return;
      } catch (err) {
        setError('Không thể xác nhận: ' + err.response?.data?.detail);
        return;
      }
    }

    // Các action khác → tiếp tục bước tiếp theo
    setLoading(true);
    try {
      const res = await transactionApi.intervene(txId, { user_response: action });
      setStep(res.data);
      setHistory(prev => [...prev, res.data]);
    } catch (err) {
      setError(err.response?.data?.detail || 'Lỗi trong quá trình can thiệp');
    } finally {
      setLoading(false);
    }
  };

  const getStepColor = (stepNum) => {
    if (stepNum === 1) return 'bg-blue-500';
    if (stepNum === 2) return 'bg-purple-500';
    if (stepNum === 3) return 'bg-orange-500';
    if (stepNum === 4) return 'bg-indigo-500';
    return 'bg-red-600';
  };

  if (loading && !step) return <div className="p-10 text-center"><LoadingSpinner /></div>;
  if (error) return <div className="p-10 text-center text-red-600">{error}</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">🛡️ Trung tâm bảo vệ giao dịch</h1>
      <p className="text-gray-500 mb-6">HITL (Human-in-the-Loop) — Bạn kiểm soát quyết định cuối cùng</p>

      {/* Progress bar */}
      {step && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Bước {step.current_step} / {step.total_steps}</span>
            <span>{step.can_proceed ? 'Sẵn sàng quyết định' : 'Cần xác minh thêm'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${getStepColor(step.current_step)}`}
              style={{ width: `${(step.current_step / step.total_steps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      {step && (
        <div className={`rounded-xl shadow-lg p-6 border-t-4 ${
          step.current_step >= 4 ? 'border-red-500 bg-red-50' : 'border-blue-500 bg-white'
        }`}>
          {/* Agent message */}
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl flex-shrink-0">
                🤖
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-none p-4 text-gray-800 whitespace-pre-line leading-relaxed">
                {step.message}
              </div>
            </div>
          </div>

          {/* Risk factors */}
          {step.risk_factors?.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">📋 Yếu tố rủi ro đã phát hiện:</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {step.risk_factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            <p className="text-sm text-gray-500 font-medium">Chọn hành động của bạn:</p>
            <div className="grid grid-cols-1 gap-3">
              {step.actions.map((action, idx) => {
                const isDanger = action.includes('Hủy') || action.includes('hủy');
                const isConfirm = action.includes('tiếp tục') || action.includes('chấp nhận');
                return (
                  <button
                    key={idx}
                    onClick={() => handleResponse(action)}
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-lg font-medium text-left transition-all ${
                      isDanger 
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300' :
                      isConfirm
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300' :
                      'bg-white border-2 border-gray-300 text-gray-700 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <span className="mr-2">
                      {isDanger ? '❌' : isConfirm ? '✅' : '➡️'}
                    </span>
                    {action}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* History of steps */}
      {history.length > 1 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">Lịch sử can thiệp:</h3>
          <div className="space-y-2">
            {history.slice(0, -1).map((h, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                <span className="font-medium text-blue-600">Bước {h.current_step}:</span> {h.message.substring(0, 100)}...
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}