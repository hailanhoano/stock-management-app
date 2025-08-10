# Stock Management App

A comprehensive stock management application with real-time Google Sheets integration.

## Features

### Inventory Management
- Real-time inventory tracking
- Multi-location support (TH and VKT warehouses)
- Automatic Google Sheets synchronization every 30 seconds
- Real-time updates via WebSocket

### Quotation Management
- Create and manage customer quotations
- **NEW: Auto-sync to Google Sheets every 30 seconds**
- **NEW: Real-time field updates to Google Sheets**
- **NEW: Immediate sync when data changes**
- Support for multiple quotation formats
- Customer management integration

### Real-time Synchronization
- WebSocket-based real-time updates
- Automatic Google Sheets polling every 30 seconds
- Change detection and broadcasting
- Sync status indicators

## Google Sheets Integration

### Quotation Auto-Sync
The quotation system now features automatic synchronization with Google Sheets:

1. **Immediate Field Updates**: Every time a user types in a field, it's automatically synced to Google Sheets within 500ms (with debouncing to prevent excessive API calls)
2. **Real-time Field Updates**: Every time a user updates a field in the quotation form, it's immediately synced to Google Sheets
3. **Auto-sync Interval**: The system automatically checks for changes in Google Sheets every 30 seconds
4. **Change Detection**: Detects when quotations are added, modified, or deleted in Google Sheets
5. **Real-time Notifications**: Shows sync status and change notifications in real-time

### Supported Fields
- Product Code (Column B)
- Product Name (Column C)
- Quantity (Column D)
- Unit Price (Column E)
- Notes (Column F)
- Brand (Column G)
- Unit (Column H)

### Sheets Supported
- BG Full 2025
- BG 2023-2024

## API Endpoints

### Quotation Items
- `GET /api/quotation-items/:quotationNumber` - Fetch quotation items from Google Sheets
- `PUT /api/quotation-items/:quotationNumber` - Update all quotation items in Google Sheets
- `PATCH /api/quotation-items/:quotationNumber/:itemIndex/:field` - Update single field in quotation item

## WebSocket Events

### Quotation Sync Events
- `quotation_sync_start` - Sync process started
- `quotation_sync_success` - Sync completed successfully
- `quotation_sync_error` - Sync encountered an error
- `quotation_update` - Quotation data updated from Google Sheets

## Setup

1. Ensure `credentials.json` exists in the server directory with proper Google Sheets API permissions
2. The spreadsheet ID is configured for the quotation sheets
3. Start the server to begin auto-sync

## Real-time Features

- **Immediate Updates**: Changes in the app are instantly reflected in Google Sheets
- **Auto-sync**: Background process checks for external changes every 30 seconds
- **Change Detection**: Identifies additions, modifications, and deletions
- **Status Indicators**: Visual feedback showing sync status and recent changes
- **WebSocket Communication**: Real-time updates across all connected clients

## Technical Details

- Uses Google Sheets API v4 for read/write operations
- **Immediate sync**: Updates Google Sheets as users type (500ms debounced)
- **Background sync**: 30-second polling for external changes
- WebSocket-based real-time communication
- Debounced updates to prevent excessive API calls
- Error handling and retry mechanisms
- Support for multiple sheet formats and structures 