import React, { useState, useEffect } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';

interface QuotationFooterProps {
  validUntil?: string;
  onValidUntilChange?: (newValidUntil: string) => void;
}

const QuotationFooter: React.FC<QuotationFooterProps> = ({
  validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
  onValidUntilChange
}) => {
  // Function to format date from YYYY-MM-DD to DD-MM-YYYY (same as header)
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return '';
    
    // If it's already in DD/MM/YYYY format, convert to DD-MM-YYYY
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
      }
    }
    
    // If it's in YYYY-MM-DD format, convert to DD-MM-YYYY
    if (dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        // Check if it's already in DD-MM-YYYY format
        if (parts[0].length === 2) {
          return dateString; // Already in DD-MM-YYYY format
        }
        // Convert from YYYY-MM-DD to DD-MM-YYYY
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    
    return dateString;
  };

  // Function to format date from DD-MM-YYYY to YYYY-MM-DD for input (same as header)
  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return '';
    
    // If it's in DD-MM-YYYY format, convert to YYYY-MM-DD
    if (dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        // Check if it's already in YYYY-MM-DD format
        if (parts[0].length === 4) {
          return dateString; // Already in YYYY-MM-DD format
        }
        // Convert from DD-MM-YYYY to YYYY-MM-DD
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    
    // If it's in DD/MM/YYYY format, convert to YYYY-MM-DD
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    
    return dateString;
  };
  const [terms, setTerms] = useState({
    delivery: true,
    payment: true,
    bankInfo: true,
    returns: true,
    cooperation: true,
    validUntil: true,
    commercialHeader: true
  });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [content, setContent] = useState({
    delivery: 'Thời gian giao hàng: 3-5 ngày làm việc đối với hàng có sẵn. Miễn phí vận chuyển cho đơn hàng trên 3 triệu đồng.',
    payment: 'Thanh toán 50% ngay sau khi đặt hàng và 50% còn lại khi nhận được thông báo giao hàng.',
    bankInfo: 'Công Ty TNHH Tam Hưng Long\n118000113979 Vietinbank CN 10 Thành Phố Hồ Chí Minh',
    returns: 'Hàng hóa được đổi trả miễn phí trong vòng 30 ngày với tất cả các lỗi của nhà sản xuất. Hàng hóa đã mở nắp, rơi vỡ trong quá trình sử dụng không được đổi trả.',
    cooperation: 'Chúng tôi rất mong nhận được sự hợp tác của Quý khách hàng.',
    validUntil: formatDateForDisplay(validUntil)
  });
  const [labels, setLabels] = useState({
    delivery: 'Giao hàng:',
    payment: 'Thanh toán:',
    bankInfo: 'Thông tin chuyển khoản:',
    returns: 'Đổi trả:',
    cooperation: 'Lời nhắn:',
    validUntil: 'Hiệu lực báo giá đến:'
  });

  useEffect(() => {
    setContent(prev => ({ ...prev, validUntil: formatDateForDisplay(validUntil) }));
  }, [validUntil]);

  return (
      <div className="mt-8 space-y-6">
      {/* Summary Section */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium">Tổng cộng:</span> 0
          </div>
          <div>
            <span className="font-medium">VAT 8%(tạm tính):</span> 0
          </div>
          <div>
            <span className="font-medium">Tổng giá trị thanh toán:</span> 0
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-600">
          VAT có thể thay đổi tùy theo quy định của Nhà nước tại thời điểm xuất hóa đơn
        </div>
      </div>

      {/* Commercial Terms */}
      <div className="space-y-4">
        {terms.commercialHeader !== false && (
          <div className="flex items-center border-b border-gray-200 py-2">
            <div className="w-48 font-bold text-gray-900">
              Điều khoản thương mại
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setTerms({ ...terms, commercialHeader: false })}
              className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
              title="Delete this row"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="space-y-2 text-sm">
          {terms.delivery && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-48 font-medium">
                {editingLabel === 'delivery' ? (
                  <input
                    value={labels.delivery}
                    onChange={(e) => setLabels({...labels, delivery: e.target.value})}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingLabel(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingLabel('delivery')}
                    className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                  >
                    {labels.delivery}
                  </div>
                )}
              </div>
              <div className="flex-1">
                {editingField === 'delivery' ? (
                  <textarea
                    value={content.delivery}
                    onChange={(e) => setContent({...content, delivery: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  <div 
                    onClick={() => setEditingField('delivery')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 whitespace-pre-line"
                  >
                    {content.delivery}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setTerms({...terms, delivery: false});
                }}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                title="Delete this row"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {terms.payment && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-48 font-medium">
                {editingLabel === 'payment' ? (
                  <input
                    value={labels.payment}
                    onChange={(e) => setLabels({...labels, payment: e.target.value})}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingLabel(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingLabel('payment')}
                    className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                  >
                    {labels.payment}
                  </div>
                )}
              </div>
              <div className="flex-1">
                {editingField === 'payment' ? (
                  <textarea
                    value={content.payment}
                    onChange={(e) => setContent({...content, payment: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  <div 
                    onClick={() => setEditingField('payment')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 whitespace-pre-line"
                  >
                    {content.payment}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setTerms({...terms, payment: false});
                }}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                title="Delete this row"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {terms.bankInfo && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-48 font-medium">
                {editingLabel === 'bankInfo' ? (
                  <input
                    value={labels.bankInfo}
                    onChange={(e) => setLabels({...labels, bankInfo: e.target.value})}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingLabel(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingLabel('bankInfo')}
                    className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                  >
                    {labels.bankInfo}
                  </div>
                )}
              </div>
              <div className="flex-1">
                {editingField === 'bankInfo' ? (
                  <textarea
                    value={content.bankInfo}
                    onChange={(e) => setContent({...content, bankInfo: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  <div 
                    onClick={() => setEditingField('bankInfo')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 whitespace-pre-line"
                  >
                    {content.bankInfo}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setTerms({...terms, bankInfo: false});
                }}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                title="Delete this row"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {terms.returns && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-48 font-medium">
                {editingLabel === 'returns' ? (
                  <input
                    value={labels.returns}
                    onChange={(e) => setLabels({...labels, returns: e.target.value})}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingLabel(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingLabel('returns')}
                    className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                  >
                    {labels.returns}
                  </div>
                )}
              </div>
              <div className="flex-1">
                {editingField === 'returns' ? (
                  <textarea
                    value={content.returns}
                    onChange={(e) => setContent({...content, returns: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  <div 
                    onClick={() => setEditingField('returns')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 whitespace-pre-line"
                  >
                    {content.returns}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setTerms({...terms, returns: false});
                }}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                title="Delete this row"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {terms.validUntil && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-48 font-medium">
                {editingLabel === 'validUntil' ? (
                  <input
                    value={labels.validUntil || 'Hiệu lực báo giá đến:'}
                    onChange={(e) => setLabels({...labels, validUntil: e.target.value})}
                    className="w-full p-1 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingLabel(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingLabel('validUntil')}
                    className="cursor-pointer hover:bg-gray-50 p-1 rounded border border-transparent hover:border-gray-200"
                  >
                    {labels.validUntil || 'Hiệu lực báo giá đến:'}
                  </div>
                )}
              </div>
              <div className="flex-1">
                {editingField === 'validUntil' ? (
                  <input
                    value={content.validUntil}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      const formattedValue = formatDateForDisplay(newValue);
                      setContent({...content, validUntil: formattedValue});
                      if (onValidUntilChange) {
                        onValidUntilChange(formattedValue);
                      }
                    }}
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                  />
                ) : (
                  <div 
                    onClick={() => setEditingField('validUntil')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200"
                  >
                    {content.validUntil}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setTerms({...terms, validUntil: false});
                }}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                title="Delete this row"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          
          {terms.cooperation && (
            <div className="flex items-center border-b border-gray-200 py-2">
              <div className="w-full font-normal whitespace-pre-line">
                {editingField === 'cooperation' ? (
                  <textarea
                    value={content.cooperation}
                    onChange={(e) => setContent({...content, cooperation: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                ) : (
                  <div
                    onClick={() => setEditingField('cooperation')}
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 whitespace-pre-line"
                  >
                    {content.cooperation}
                  </div>
                )}
              </div>
            </div>
          )}
          
                {/* Signature Section - Moved here, right after cooperation message */}
      <div className="flex justify-between items-end pt-4 pb-32">
        <div className="flex items-center space-x-4">
          <div className="text-center relative ml-60">
            <div className="text-sm text-gray-600 mb-2">Trân trọng,</div>
            <div className="font-medium">Công ty TNHH Tam Hưng Long</div>
            
            {/* Company Logo - 4.5x bigger and positioned over "Long" area */}
            <div className="absolute top-8 -right-20">
              <img 
                src="/moc-tron-cty.png" 
                alt="Company Logo" 
                className="h-52 w-auto"
              />
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className="font-bold text-lg text-blue-600">XÁC NHẬN ĐẶT HÀNG</div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationFooter; 