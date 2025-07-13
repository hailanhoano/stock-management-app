import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';

// Types
export interface StockItem {
  id: string;
  name?: string;
  quantity?: number;
  price?: number;
  category?: string;
  min_quantity?: number;
  supplier?: string;
  last_updated?: string;
  // Vietnamese column fields
  brand?: string;
  product_code?: string;
  product_name?: string;
  lot_number?: string;
  date?: string;
  unit?: string;
  expiry_date?: string;
  import_date?: string;
  location?: string;
  warehouse?: string;
  notes?: string;
}

export interface SalesRecord {
  id: string;
  item_name: string;
  quantity: number;
  amount: number;
  date: string;
  customer: string;
}

export interface PurchaseRecord {
  id: string;
  item_name: string;
  quantity: number;
  amount: number;
  date: string;
  supplier: string;
}

export interface Analytics {
  inventoryValue: number;
  salesValue: number;
  purchaseValue: number;
  profit: number;
  lowStockItems: StockItem[];
  topSellingItems: Array<{ item: string; count: number }>;
  recentActivity: Array<{ type: string; date: string; [key: string]: any }>;
}

export interface StockState {
  inventory: StockItem[];
  sales: SalesRecord[];
  purchases: PurchaseRecord[];
  analytics: Analytics | null;
  loading: boolean;
  error: string | null;
  spreadsheetIds: {
    inventory: string;
    sales: string;
    purchases: string;
  };
}

// Action types
type StockAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_INVENTORY'; payload: StockItem[] }
  | { type: 'SET_SALES'; payload: SalesRecord[] }
  | { type: 'SET_PURCHASES'; payload: PurchaseRecord[] }
  | { type: 'SET_ANALYTICS'; payload: Analytics }
  | { type: 'SET_SPREADSHEET_IDS'; payload: { inventory: string; sales: string; purchases: string } };

// Initial state
const initialState: StockState = {
  inventory: [],
  sales: [],
  purchases: [],
  analytics: null,
  loading: false,
  error: null,
  spreadsheetIds: {
    inventory: '',
    sales: '',
    purchases: ''
  }
};

// Reducer
function stockReducer(state: StockState, action: StockAction): StockState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_INVENTORY':
      return { ...state, inventory: action.payload };
    case 'SET_SALES':
      return { ...state, sales: action.payload };
    case 'SET_PURCHASES':
      return { ...state, purchases: action.payload };
    case 'SET_ANALYTICS':
      return { ...state, analytics: action.payload };
    case 'SET_SPREADSHEET_IDS':
      return { ...state, spreadsheetIds: action.payload };
    default:
      return state;
  }
}

// Context
const StockContext = createContext<{
  state: StockState;
  dispatch: React.Dispatch<StockAction>;
  fetchStockData: () => Promise<void>;
  fetchInventory: () => Promise<void>;
  fetchAnalytics: () => Promise<void>;
  updateSpreadsheetIds: (ids: { inventory: string; sales: string; purchases: string }) => void;
} | undefined>(undefined);

// Provider
export const StockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(stockReducer, initialState);

  // Load configuration on mount
  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        // Add a small delay to prevent rapid requests
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const response = await fetch('/api/config', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const data = await response.json();
        
        if (data.success && data.data.spreadsheetIds) {
          dispatch({ type: 'SET_SPREADSHEET_IDS', payload: data.data.spreadsheetIds });
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    };

    loadConfig();
  }, []);

  const fetchStockData = useCallback(async () => {
    if (!state.spreadsheetIds.inventory || !state.spreadsheetIds.sales || !state.spreadsheetIds.purchases) {
      dispatch({ type: 'SET_ERROR', payload: 'Please configure spreadsheet IDs in settings' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const params = new URLSearchParams({
        spreadsheetId1: state.spreadsheetIds.inventory,
        spreadsheetId2: state.spreadsheetIds.sales,
        spreadsheetId3: state.spreadsheetIds.purchases
      });

      const response = await fetch(`/api/stock/overview?${params}`);
      const data = await response.json();

      if (data.success) {
        dispatch({ type: 'SET_INVENTORY', payload: data.data.inventory });
        dispatch({ type: 'SET_SALES', payload: data.data.sales });
        dispatch({ type: 'SET_PURCHASES', payload: data.data.purchases });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch stock data' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.spreadsheetIds.inventory, state.spreadsheetIds.sales, state.spreadsheetIds.purchases]);

  const fetchInventory = useCallback(async () => {
    console.log('fetchInventory called');
    console.log('Current spreadsheet ID:', state.spreadsheetIds.inventory);
    console.log('Token:', localStorage.getItem('token') ? 'Present' : 'Missing');
    
    // If spreadsheet ID is not loaded yet, try to load config first
    if (!state.spreadsheetIds.inventory) {
      console.log('No spreadsheet ID, loading config...');
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.log('No token found');
          dispatch({ type: 'SET_ERROR', payload: 'Please log in first' });
          return;
        }
        
        const response = await fetch('/api/config', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        console.log('Config response:', data);
        
        if (data.success && data.data.spreadsheetIds) {
          dispatch({ type: 'SET_SPREADSHEET_IDS', payload: data.data.spreadsheetIds });
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Please configure inventory spreadsheet ID' });
          return;
        }
      } catch (error) {
        console.error('Error loading config:', error);
        dispatch({ type: 'SET_ERROR', payload: 'Please configure inventory spreadsheet ID' });
        return;
      }
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const params = new URLSearchParams({
        spreadsheetId: state.spreadsheetIds.inventory
      });

      console.log('Fetching inventory with params:', params.toString());
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/stock/inventory?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      console.log('Inventory response:', data);

      if (data.success) {
        dispatch({ type: 'SET_INVENTORY', payload: data.data });
      } else {
        dispatch({ type: 'SET_ERROR', payload: data.message || 'Failed to fetch inventory data' });
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch inventory data' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.spreadsheetIds.inventory]);

  const fetchAnalytics = useCallback(async () => {
    // Only require inventory spreadsheet ID for basic analytics
    if (!state.spreadsheetIds.inventory) {
      dispatch({ type: 'SET_ERROR', payload: 'Please configure inventory spreadsheet ID' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Create basic analytics from inventory data only
      const basicAnalytics = {
        inventoryValue: state.inventory.reduce((sum, item) => sum + (parseFloat(item.quantity?.toString() || '0') * parseFloat(item.price?.toString() || '0')), 0),
        salesValue: 0,
        purchaseValue: 0,
        profit: 0,
        lowStockItems: state.inventory.filter(item => {
          const quantity = parseFloat(item.quantity?.toString() || '0');
          const minQuantity = parseFloat(item.min_quantity?.toString() || '10');
          return quantity < minQuantity;
        }),
        topSellingItems: [],
        recentActivity: []
      };

      dispatch({ type: 'SET_ANALYTICS', payload: basicAnalytics });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to generate analytics data' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.spreadsheetIds.inventory, state.inventory]);

  const updateSpreadsheetIds = useCallback(async (ids: { inventory: string; sales: string; purchases: string }) => {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ spreadsheetIds: ids })
      });
      
      const data = await response.json();
      
      if (data.success) {
        dispatch({ type: 'SET_SPREADSHEET_IDS', payload: ids });
      } else {
        console.error('Failed to save configuration:', data.message);
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
    }
  }, []);

  return (
    <StockContext.Provider value={{
      state,
      dispatch,
      fetchStockData,
      fetchInventory,
      fetchAnalytics,
      updateSpreadsheetIds
    }}>
      {children}
    </StockContext.Provider>
  );
};

// Hook
export const useStock = () => {
  const context = useContext(StockContext);
  if (context === undefined) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}; 