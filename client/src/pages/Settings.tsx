import React, { useState } from 'react';
import { useStock } from '../context/StockContext';
import UserManagement from '../components/UserManagement';

const Settings: React.FC = () => {
  const { state, updateSpreadsheetIds } = useStock();
  const [spreadsheetIds, setSpreadsheetIds] = useState({
    inventory: state.spreadsheetIds.inventory,
    sales: state.spreadsheetIds.sales,
    purchases: state.spreadsheetIds.purchases
  });

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    
    try {
      await updateSpreadsheetIds(spreadsheetIds);
      setSaveMessage('Configuration saved successfully!');
    } catch (error) {
      setSaveMessage('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your Google Sheets integration
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Google Sheets Configuration
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Enter the IDs of your Google Sheets spreadsheets. You can find the ID in the URL of your spreadsheet.
          </p>
          
          <div className="mt-6 space-y-6">
            <div>
              <label htmlFor="inventory" className="block text-sm font-medium text-gray-700">
                Inventory Spreadsheet ID
              </label>
              <input
                type="text"
                id="inventory"
                value={spreadsheetIds.inventory}
                onChange={(e) => {
                  let value = e.target.value;
                  // Remove /edit from the end if present
                  if (value.endsWith('/edit')) {
                    value = value.replace('/edit', '');
                  }
                  setSpreadsheetIds(prev => ({ ...prev, inventory: value }));
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter inventory spreadsheet ID"
              />
              <p className="mt-1 text-xs text-gray-500">
                This spreadsheet should contain your inventory items with Vietnamese columns: Tên hãng, Mã hàng, Tên hàng, Số Lot, Date, Số lượng, Đơn vị, Ngày hết hạn, Ngày nhập kho, Vị trí đặt hàng, Tên Kho, Ghi chú
              </p>
            </div>

            <div>
              <label htmlFor="sales" className="block text-sm font-medium text-gray-700">
                Sales Spreadsheet ID
              </label>
              <input
                type="text"
                id="sales"
                value={spreadsheetIds.sales}
                onChange={(e) => {
                  let value = e.target.value;
                  // Remove /edit from the end if present
                  if (value.endsWith('/edit')) {
                    value = value.replace('/edit', '');
                  }
                  setSpreadsheetIds(prev => ({ ...prev, sales: value }));
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter sales spreadsheet ID"
              />
              <p className="mt-1 text-xs text-gray-500">
                This spreadsheet should contain your sales records with columns like: Item Name, Quantity, Amount, Date, Customer, etc.
              </p>
            </div>

            <div>
              <label htmlFor="purchases" className="block text-sm font-medium text-gray-700">
                Purchases Spreadsheet ID
              </label>
              <input
                type="text"
                id="purchases"
                value={spreadsheetIds.purchases}
                onChange={(e) => {
                  let value = e.target.value;
                  // Remove /edit from the end if present
                  if (value.endsWith('/edit')) {
                    value = value.replace('/edit', '');
                  }
                  setSpreadsheetIds(prev => ({ ...prev, purchases: value }));
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter purchases spreadsheet ID"
              />
              <p className="mt-1 text-xs text-gray-500">
                This spreadsheet should contain your purchase records with columns like: Item Name, Quantity, Amount, Date, Supplier, etc.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            {saveMessage && (
              <p className={`mt-2 text-sm ${saveMessage.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
                {saveMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Setup Instructions</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <ol className="list-decimal list-inside space-y-1">
                <li>Create 3 Google Sheets spreadsheets for Inventory, Sales, and Purchases</li>
                <li>Make sure the first row contains column headers</li>
                <li>Share the spreadsheets with your Google Service Account email</li>
                <li>Copy the spreadsheet IDs from the URLs and paste them above</li>
                <li>Place your Google Service Account credentials file as 'credentials.json' in the server directory</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Spreadsheet Format</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p><strong>Inventory:</strong> Tên hãng, Mã hàng, Tên hàng, Số Lot, Date, Số lượng, Đơn vị, Ngày hết hạn, Ngày nhập kho, Vị trí đặt hàng, Tên Kho, Ghi chú</p>
              <p><strong>Sales:</strong> Item_Name, Quantity, Amount, Date, Customer</p>
              <p><strong>Purchases:</strong> Item_Name, Quantity, Amount, Date, Supplier</p>
            </div>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <UserManagement />
        </div>
      </div>
    </div>
  );
};

export default Settings; 