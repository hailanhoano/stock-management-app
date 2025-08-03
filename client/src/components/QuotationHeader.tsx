import React, { useState, useEffect } from 'react';

interface QuotationHeaderProps {
  quotationNumber?: string;
  date?: string;
  expiryDate?: string;
  salesRep?: string;
  salesEmail?: string;
  salesPhone?: string;
  onDateChange?: (date: string) => void;
  onExpiryDateChange?: (expiryDate: string) => void;
  onSalesRepChange?: (salesRep: string, email: string, phone: string) => void;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

const QuotationHeader: React.FC<QuotationHeaderProps> = ({
  quotationNumber = '10935',
  date = '26/07/2025',
  expiryDate = '31/07/2025',
  salesRep = 'Tam Giang - 0916999013',
  salesEmail = 'admin@example.com',
  salesPhone = '0916999013',
  onDateChange,
  onExpiryDateChange,
  onSalesRepChange
}) => {
  const [contactDetails, setContactDetails] = useState(
    'No. 100 Street 9, Hamlet 2, Binh Hung Commune\nHo Chi Minh City, Vietnam\nTel: +84 28 66719597\nWebsite: www.tamhunglong.vn'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('BÁO GIÁ/ QUOTATION');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingExpiryDate, setIsEditingExpiryDate] = useState(false);
  const [isEditingSalesRep, setIsEditingSalesRep] = useState(false);
  const [currentDate, setCurrentDate] = useState(date);
  const [currentExpiryDate, setCurrentExpiryDate] = useState(expiryDate);
  const [currentSalesRep, setCurrentSalesRep] = useState(salesRep);
  const [currentSalesEmail, setCurrentSalesEmail] = useState(salesEmail);
  const [currentSalesPhone, setCurrentSalesPhone] = useState(salesPhone);
  const [users, setUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Load users for dropdown
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3001/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        }
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };
    loadUsers();
  }, []);

  // Sync internal expiry date state with prop
  useEffect(() => {
    setCurrentExpiryDate(expiryDate);
  }, [expiryDate]);

  // Sync internal date state with prop
  useEffect(() => {
    setCurrentDate(date);
  }, [date]);

  // Function to format date from YYYY-MM-DD to DD-MM-YYYY
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

  // Function to format date from DD-MM-YYYY to YYYY-MM-DD for input
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

  const handleDateChange = (newDate: string) => {
    // Format the date for display and store it
    const formattedDate = formatDateForDisplay(newDate);
    setCurrentDate(formattedDate);
    onDateChange?.(formattedDate);
  };

  const handleExpiryDateChange = (newExpiryDate: string) => {
    // Format the date for display and store it
    const formattedDate = formatDateForDisplay(newExpiryDate);
    setCurrentExpiryDate(formattedDate);
    onExpiryDateChange?.(formattedDate);
  };

  const handleSalesRepChange = (user: User) => {
    const salesRepText = user.phone ? `${user.name} - ${user.phone}` : user.name;
    setCurrentSalesRep(salesRepText);
    setCurrentSalesEmail(user.email);
    setCurrentSalesPhone(user.phone || '');
    setIsEditingSalesRep(false);
    onSalesRepChange?.(salesRepText, user.email, user.phone || '');
  };

  // Function to get background color for different users
  const getUserBackgroundColor = (userName: string) => {
    const colorMap: { [key: string]: string } = {
      'Tam Giang': 'bg-blue-50 border-blue-200',
      'Mai Võ': 'bg-green-50 border-green-200',
      'Yến Nhi': 'bg-purple-50 border-purple-200',
      'Như Xuyến': 'bg-pink-50 border-pink-200',
      'Bích Ngọc': 'bg-yellow-50 border-yellow-200',
      'Thảo Vy': 'bg-indigo-50 border-indigo-200',
      'Hải Đăng': 'bg-orange-50 border-orange-200',
      'Minh Thư': 'bg-red-50 border-red-200'
    };
    return colorMap[userName] || 'bg-gray-50 border-gray-200';
  };

  // Function to get the user name from the sales rep text
  const getUserNameFromSalesRep = (salesRepText: string) => {
    return salesRepText.split(' - ')[0];
  };

  return (
    <div className="bg-white border-b-2 border-green-600 mb-6">
      {/* Top Green Bar */}
      <div className="bg-green-600 h-2"></div>
      
      <div className="p-6">
        <div className="flex justify-between items-start">
          {/* Left Section - Company Information */}
          <div className="flex-1">
            {/* Logo */}
            <div className="flex items-center mb-4">
              <img 
                src="/logo1.png" 
                alt="THU scientific" 
                className="h-12 w-auto"
              />
            </div>
            
            {/* Contact Details */}
            <div className="text-sm text-gray-800">
              {isEditing ? (
                <textarea
                  value={contactDetails}
                  onChange={(e) => setContactDetails(e.target.value)}
                  className="w-96 p-2 border border-gray-300 rounded text-sm resize-none"
                  rows={4}
                  onBlur={() => setIsEditing(false)}
                  autoFocus
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />
              ) : (
                <div
                  onClick={() => setIsEditing(true)}
                  className="w-96 cursor-pointer hover:bg-gray-50 p-2 rounded hover:border hover:border-gray-300 whitespace-pre-line"
                >
                  {contactDetails}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Section - Quotation Details */}
          <div className="text-left">
            {/* Company Name */}
            <div className="text-xl font-bold text-blue-600 mb-2 text-right">
              <span className="text-green-600">T</span>AM <span className="text-green-600">H</span>UNG <span className="text-green-600">L</span>ONG CO LTD
            </div>
            
            {/* Quotation Details */}
            <div className="text-sm text-gray-800">
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0">
                <div className="font-medium text-sm leading-6">Date:</div>
                <div className="text-sm leading-6">
                  {isEditingDate ? (
                    <input
                      type="date"
                      value={formatDateForInput(currentDate)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full p-1 border border-gray-300 rounded text-sm h-6"
                      onBlur={() => setIsEditingDate(false)}
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => setIsEditingDate(true)}
                      className="cursor-pointer hover:bg-gray-50 px-1 rounded hover:border hover:border-gray-300 block h-6 leading-6"
                    >
                      {formatDateForDisplay(currentDate)}
                    </span>
                  )}
                </div>
                
                <div className="font-medium text-sm leading-6">Sales Rep:</div>
                <div className="text-sm leading-6 relative">
                  <div
                    className={`px-1 rounded border block h-6 leading-6 ${getUserBackgroundColor(getUserNameFromSalesRep(currentSalesRep))} ${isEditingSalesRep ? 'border-gray-400' : 'cursor-pointer hover:border-gray-300'}`}
                    onClick={() => setIsEditingSalesRep(!isEditingSalesRep)}
                  >
                    {currentSalesRep}
                  </div>
                  {isEditingSalesRep && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-32 overflow-y-auto">
                      {users.map(user => (
                        <div
                          key={user.id}
                          onClick={() => handleSalesRepChange(user)}
                          className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          {user.name} - {user.phone || ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="font-medium text-sm leading-6">E-mail:</div>
                <div className="text-sm leading-6 pl-1">{currentSalesEmail}</div>
                
                <div className="font-medium text-sm leading-6">Quote #:</div>
                <div className="text-sm leading-6">{quotationNumber}</div>
                
                <div className="font-medium text-sm leading-6">Expiry date:</div>
                <div className="text-sm leading-6">
                  {isEditingExpiryDate ? (
                    <input
                      type="date"
                      value={formatDateForInput(currentExpiryDate)}
                      onChange={(e) => handleExpiryDateChange(e.target.value)}
                      className="w-full p-1 border border-gray-300 rounded text-sm h-6"
                      onBlur={() => setIsEditingExpiryDate(false)}
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => setIsEditingExpiryDate(true)}
                      className="cursor-pointer hover:bg-gray-50 px-1 rounded hover:border hover:border-gray-300 block h-6 leading-6"
                    >
                      {formatDateForDisplay(currentExpiryDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Separator Line */}
        <div className="border-t border-gray-300 my-4"></div>
        
        {/* Document Title */}
        <div className="text-center">
          {isEditingTitle ? (
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-3xl font-bold text-blue-600 text-center bg-transparent focus:outline-none resize-none border border-gray-300 rounded w-full"
              onBlur={() => setIsEditingTitle(false)}
              autoFocus
              rows={title.split('\n').length}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />
          ) : (
            <h1
              className="text-3xl font-bold text-blue-600 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded hover:border hover:border-gray-300 whitespace-pre-line"
              onClick={() => setIsEditingTitle(true)}
            >
              {title}
            </h1>
          )}
        </div>
        
        {/* Bottom Separator Line */}
        <div className="border-t border-gray-300 mt-4"></div>
      </div>
    </div>
  );
};

export default QuotationHeader; 