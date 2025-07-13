import React, { useEffect } from 'react';
import { useStock } from '../context/StockContext';
import { 
  CubeIcon, 
  CurrencyDollarIcon, 
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon 
} from '@heroicons/react/24/outline';

const Dashboard: React.FC = () => {
  const { state } = useStock();

  const stats = [
    {
      name: 'Total Items',
      value: state.inventory.length,
      icon: CubeIcon,
      color: 'bg-blue-500',
    },
    {
      name: 'Low Stock Items',
      value: state.inventory.filter(item => 
        parseInt(item.quantity?.toString() || '0') < parseInt(item.min_quantity?.toString() || '10')
      ).length,
      icon: ExclamationTriangleIcon,
      color: 'bg-yellow-500',
    },
    {
      name: 'Total Categories',
      value: new Set(state.inventory.map(item => item.brand).filter(Boolean)).size,
      icon: ArrowTrendingUpIcon,
      color: 'bg-green-500',
    },
    {
      name: 'Total Value',
      value: `$${state.inventory.reduce((sum, item) => 
        sum + (parseFloat(item.quantity?.toString() || '0') * parseFloat(item.price?.toString() || '0')), 0
      ).toFixed(2)}`,
      icon: CurrencyDollarIcon,
      color: 'bg-purple-500',
    },
  ];

  const lowStockItems = state.inventory.filter(item => 
    parseInt(item.quantity?.toString() || '0') < parseInt(item.min_quantity?.toString() || '10')
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your stock management system
        </p>
      </div>

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{state.error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <stat.icon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {state.loading ? '...' : stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low Stock Items */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Low Stock Items
            </h3>
            <div className="mt-5">
              {lowStockItems.length === 0 ? (
                <p className="text-sm text-gray-500">No low stock items</p>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Quantity: {item.quantity} / Min: {item.min_quantity}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Low Stock
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Items */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Recent Items
            </h3>
            <div className="mt-5">
              {state.inventory.length === 0 ? (
                <p className="text-sm text-gray-500">No items in inventory</p>
              ) : (
                <div className="space-y-3">
                  {state.inventory.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.product_name || item.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {item.brand} - Qty: {item.quantity}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {item.product_code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Summary */}
      {state.analytics && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Financial Summary
            </h3>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Inventory Value</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">
                  ${state.analytics.inventoryValue.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Sales</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-600">
                  ${state.analytics.salesValue.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Profit</dt>
                <dd className={`mt-1 text-3xl font-semibold ${
                  state.analytics.profit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${state.analytics.profit.toFixed(2)}
                </dd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 