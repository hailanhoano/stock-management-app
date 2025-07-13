import React, { useEffect } from 'react';
import { useStock } from '../context/StockContext';

const Analytics: React.FC = () => {
  const { state, fetchAnalytics } = useStock();

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Detailed financial analysis and insights
        </p>
      </div>

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{state.error}</div>
            </div>
          </div>
        </div>
      )}

      {state.analytics && (
        <div className="space-y-6">
          {/* Financial Summary */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Financial Summary
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-4">
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
                  <dt className="text-sm font-medium text-gray-500">Total Purchases</dt>
                  <dd className="mt-1 text-3xl font-semibold text-blue-600">
                    ${state.analytics.purchaseValue.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Net Profit</dt>
                  <dd className={`mt-1 text-3xl font-semibold ${
                    state.analytics.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ${state.analytics.profit.toFixed(2)}
                  </dd>
                </div>
              </div>
            </div>
          </div>

          {/* Top Selling Items */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Top Selling Items
              </h3>
              <div className="mt-5">
                {state.analytics.topSellingItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No sales data available</p>
                ) : (
                  <div className="space-y-3">
                    {state.analytics.topSellingItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-500 mr-2">
                            #{index + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {item.item}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {item.count} sales
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Low Stock Items */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Low Stock Items
              </h3>
              <div className="mt-5">
                {state.analytics.lowStockItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No low stock items</p>
                ) : (
                  <div className="space-y-3">
                    {state.analytics.lowStockItems.map((item, index) => (
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

          {/* Recent Activity */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Recent Activity
              </h3>
              <div className="mt-5">
                {state.analytics.recentActivity.length === 0 ? (
                  <p className="text-sm text-gray-500">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {state.analytics.recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            activity.type === 'sale' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {activity.type === 'sale' ? 'Sale' : 'Purchase'}
                          </span>
                          <span className="ml-3 text-sm font-medium text-gray-900">
                            {activity.item_name}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            ${parseFloat(activity.amount?.toString() || '0').toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">
                            {activity.date}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {state.loading && (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-sm text-gray-500">Loading analytics...</p>
        </div>
      )}
    </div>
  );
};

export default Analytics; 