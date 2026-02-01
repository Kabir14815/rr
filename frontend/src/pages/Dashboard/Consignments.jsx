import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Download, Trash2, Save, X, Search } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'; 
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { consignmentsAPI, authAPI, invoicesAPI, rateCardsAPI } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import './Consignments.css';

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule]);

const ZONES = ['LOCAL', 'ZONAL', 'METRO', 'ROI', 'WEST', 'NORTH', 'SOUTH', 'EAST'];

const DELIVERY_PARTNERS = ['DTDC', 'Delhivery', 'BlueDart', 'FedEx', 'DHL', 'Ecom Express', 'Xpressbees', 'Shadowfax', 'Other'];

const SERVICE_TYPES = [
  { value: 'cargo', label: 'Cargo' },
  { value: 'courier', label: 'Courier' },
  { value: 'other', label: 'Other (DTDC + Tariff)' }
];

const TRANSPORT_MODES = [
  { value: 'surface', label: 'Surface' },
  { value: 'air', label: 'Air' }
];

const CARGO_REGIONS = [
  { value: 'north', label: 'North' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'south', label: 'South' },
  { value: 'central', label: 'Central' },
  { value: 'kerala', label: 'Kerala' },
  { value: 'guwahati', label: 'Guwahati' },
  { value: 'north_east', label: 'North East' }
];

const COURIER_ZONES = [
  { value: 'zone_1', label: 'Zone 1 - Tricity' },
  { value: 'zone_2', label: 'Zone 2 - Delhi, Punjab, Haryana' },
  { value: 'zone_3', label: 'Zone 3 - UP, HP, Jammu, Rajasthan' },
  { value: 'zone_4', label: 'Zone 4 - Rest of India' },
  { value: 'zone_5', label: 'Zone 5 - Assam' },
  { value: 'zone_6', label: 'Zone 6 - North East' }
];

function Consignments() {
  const [consignments, setConsignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const toast = useToast();
  
  // Rate card fetching state
  const [rateCardLoading, setRateCardLoading] = useState(false);
  const [rateCardError, setRateCardError] = useState('');
  const [rateCardFetched, setRateCardFetched] = useState(false);
  
  // New Entry State with rate card fields
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    name: '',
    user_id: '',
    destination: '',
    destination_city: '',
    destination_state: '',
    destination_pincode: '',
    pieces: 1,
    weight: 0,
    product_name: '',
    invoice_no: '',
    invoice_id: '',
    // Rate card selection fields
    delivery_partner: '',
    service_type: '',
    mode: '',
    region: '',
    courier_zone: '',
    zone: 'LOCAL',
    // Pricing fields (auto-populated from rate card)
    base_rate: 0,
    docket_charges: 0,
    oda_charge: 0,
    fov: 0,
    fuel_charge: 0,
    gst: 0,
    value: 0,
    rate_card_id: '',
    box1_dimensions: '',
    box2_dimensions: '',
    box3_dimensions: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        consignmentsAPI.list(),
        authAPI.listUsers(0, 1000),
        invoicesAPI.list()
      ]);

      const [consignmentsResult, usersResult, invoicesResult] = results;

      if (consignmentsResult.status === 'fulfilled') {
        setConsignments(consignmentsResult.value.data);
      } else {
        console.error('Failed to load consignments:', consignmentsResult.reason);
        toast.error('Failed to load consignments data');
      }

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.data);
      } else {
        console.warn('Failed to load users:', usersResult.reason);
        // Don't show toast for this independent failure to avoid spamming
      }

      if (invoicesResult.status === 'fulfilled') {
        setInvoices(invoicesResult.value.data);
      } else {
        console.warn('Failed to load invoices:', invoicesResult.reason);
      }
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch rate card based on selection
  const fetchRateCard = async (entry) => {
    // Check if all required fields are filled
    if (!entry.user_id || !entry.delivery_partner || !entry.service_type || !entry.mode) {
      return;
    }

    // For cargo, require region; for courier, require courier_zone
    if (entry.service_type === 'cargo' && !entry.region) {
      return;
    }
    if (entry.service_type === 'courier' && !entry.courier_zone) {
      return;
    }

    setRateCardLoading(true);
    setRateCardError('');

    try {
      const params = {
        user_id: entry.user_id,
        delivery_partner: entry.delivery_partner,
        service_type: entry.service_type,
        mode: entry.mode,
      };

      if (entry.service_type === 'cargo') {
        params.region = entry.region;
      } else if (entry.service_type === 'courier') {
        params.zone = entry.courier_zone;
      }

      const response = await rateCardsAPI.fetch(params);
      const data = response.data;

      if (data.found && data.rate_card) {
        const rc = data.rate_card;
        setNewEntry(prev => ({
          ...prev,
          base_rate: rc.base_rate || 0,
          docket_charges: rc.docket_charge || 0,
          oda_charge: rc.odi || 0,
          fov: rc.fov || 0,
          fuel_charge: rc.fuel_charge || 0,
          gst: rc.gst || 0,
          rate_card_id: rc._id || '',
        }));
        setRateCardFetched(true);
        setRateCardError('');
        toast.success('Rate card fetched successfully!');
      } else {
        setRateCardError(data.message || 'No matching rate card found. Please contact admin.');
        setRateCardFetched(false);
        // Reset pricing fields
        setNewEntry(prev => ({
          ...prev,
          base_rate: 0,
          docket_charges: 0,
          oda_charge: 0,
          fov: 0,
          fuel_charge: 0,
          gst: 0,
          rate_card_id: '',
        }));
      }
    } catch (err) {
      console.error('Failed to fetch rate card:', err);
      setRateCardError('Failed to fetch rate card. Please try again.');
      setRateCardFetched(false);
    } finally {
      setRateCardLoading(false);
    }
  };

  // Reset form to initial state
  const resetForm = () => {
    setNewEntry({
      date: new Date().toISOString().split('T')[0],
      name: '',
      user_id: '',
      destination: '',
      destination_city: '',
      destination_state: '',
      destination_pincode: '',
      pieces: 1,
      weight: 0,
      product_name: '',
      invoice_no: '',
      invoice_id: '',
      delivery_partner: '',
      service_type: '',
      mode: '',
      region: '',
      courier_zone: '',
      zone: 'LOCAL',
      base_rate: 0,
      docket_charges: 0,
      oda_charge: 0,
      fov: 0,
      fuel_charge: 0,
      gst: 0,
      value: 0,
      rate_card_id: '',
      box1_dimensions: '',
      box2_dimensions: '',
      box3_dimensions: '',
    });
    setRateCardFetched(false);
    setRateCardError('');
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    
    // Validate rate card if rate card fields are selected
    if (newEntry.delivery_partner && newEntry.service_type && newEntry.mode) {
      if (!rateCardFetched) {
        toast.error('Please wait for rate card to be fetched or select valid rate card criteria');
        return;
      }
    }
    
    try {
      await consignmentsAPI.create(newEntry);
      setShowAddModal(false);
      resetForm();
      // Refresh only consignments list
      const response = await consignmentsAPI.list();
      setConsignments(response.data);
      toast.success('Consignment added successfully!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create entry');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    try {
      await consignmentsAPI.delete(id);
      const response = await consignmentsAPI.list();
      setConsignments(response.data);
      toast.success('Entry deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete entry');
      console.error(err);
    }
  };

  const handleExportExcel = async (options = {}) => {
    try {
      let params = {};
      
      if (options.type === 'selected') {
        const ids = selectedRows.map(row => row._id).join(',');
        params = { ids };
      } else if (options.type === 'dateRange') {
        params = { start_date: options.dateFrom, end_date: options.dateTo };
      } else if (options.type === 'zone') {
        params = { zone: options.zone };
      }

      const response = await consignmentsAPI.exportExcel(params);
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consignments_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      setError('Failed to export Excel');
      console.error(err);
      toast.error('Export failed');
    }
  };

  const calculateTotal = (entry) => {
    const baseAmount = 
      parseFloat(entry.base_rate || 0) +
      parseFloat(entry.docket_charges || 0) +
      parseFloat(entry.oda_charge || 0);
    
    // FOV is now a multiplier from rate card
    const fovValue = parseFloat(entry.fov || 0);
    
    // Fuel charge is a percentage
    const fuelChargeAmount = baseAmount * (parseFloat(entry.fuel_charge || 0) / 100);
    
    // GST is a percentage applied to subtotal
    const subtotal = baseAmount + fovValue + fuelChargeAmount;
    const gstAmount = subtotal * (parseFloat(entry.gst || 0) / 100);
    
    return subtotal + gstAmount;
  };

  // AG Grid Column Definitions
  const columnDefs = useMemo(() => [
    { field: 'sr_no', headerName: 'SR NO', width: 80, sortable: true, filter: true, pinned: 'left' },
    { field: 'date', headerName: 'DATE', width: 120, sortable: true, filter: 'agDateColumnFilter' },
    { field: 'consignment_no', headerName: 'CONSIGNMENT NO', width: 160, sortable: true, filter: true },
    { field: 'name', headerName: 'NAME', width: 180, sortable: true, filter: true },
    { field: 'destination', headerName: 'DESTINATION', width: 150, sortable: true, filter: true },
    { field: 'pieces', headerName: 'pc', width: 80, sortable: true },
    { field: 'weight', headerName: 'Wt', width: 80, sortable: true },
    { field: 'product_name', headerName: 'PRODUCT', width: 150, sortable: true },
    { field: 'invoice_no', headerName: 'INVOICE', width: 120, sortable: true },
    { field: 'zone', headerName: 'ZONE', width: 100, sortable: true, filter: true },
    { 
      field: 'base_rate', 
      headerName: 'BASE RATE', 
      width: 110,
      valueFormatter: params => `₹${params.value}`
    },
    { field: 'docket_charges', headerName: 'DOCKET', width: 100 },
    { field: 'oda_charge', headerName: 'ODA', width: 90 },
    { field: 'fov', headerName: 'FOV', width: 90 },
    { field: 'value', headerName: 'VALUE', width: 100 },
    { 
      field: 'total', 
      headerName: 'TOTAL', 
      width: 110, 
      cellStyle: { fontWeight: 'bold', color: '#059669' },
      valueFormatter: params => `₹${params.value}`
    },
    { field: 'box1_dimensions', headerName: 'BOX 1', width: 120 },
    { field: 'box2_dimensions', headerName: 'BOX 2', width: 120 },
    { field: 'box3_dimensions', headerName: 'BOX 3', width: 120 },
    {
      headerName: 'ACTIONS',
      field: 'actions',
      pinned: 'right',
      width: 100,
      cellRenderer: (params) => (
        <button 
          className="btn-icon btn-delete" 
          onClick={() => handleDelete(params.data._id || params.data.id)}
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      )
    }
  ], []);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
    filter: true,
    flex: 0,
    minWidth: 100
  }), []);

  if (loading) return <div className="loading">Loading consignments...</div>;

  return (
    <div className="consignments-page">
      <div className="page-header">
        <h1>Consignment Sheet</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Add Entry
          </button>
          <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="ag-theme-quartz grid-container" style={{ height: 'calc(100vh - 200px)', width: '100%' }}>
        <AgGridReact
          rowData={consignments}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}
          paginationPageSize={20}
          animateRows={true}
          rowSelection='multiple'
          onSelectionChanged={(event) => setSelectedRows(event.api.getSelectedRows())}
        />
      </div>

      {/* Export Options Modal */}
      {showExportModal && (
        <ExportModal 
          onClose={() => setShowExportModal(false)}
          onExport={handleExportExcel}
          totalConsignments={consignments.length}
          selectedCount={selectedRows.length}
        />
      )}

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <div className="modal-header">
              <h2>Add New Consignment</h2>
              <button className="btn-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddEntry}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={newEntry.date}
                      onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Sender/User *</label>
                    <select
                      value={newEntry.user_id}
                      onChange={(e) => {
                        const selectedUser = users.find(u => u._id === e.target.value);
                        const updated = { 
                          ...newEntry, 
                          user_id: e.target.value,
                          name: selectedUser?.full_name || '',
                          // Reset rate card fields when user changes
                          base_rate: 0,
                          docket_charges: 0,
                          oda_charge: 0,
                          fov: 0,
                          fuel_charge: 0,
                          gst: 0,
                          rate_card_id: '',
                        };
                        setNewEntry(updated);
                        setRateCardFetched(false);
                        setRateCardError('');
                        // Trigger rate card fetch if other fields are already set
                        if (updated.delivery_partner && updated.service_type && updated.mode) {
                          fetchRateCard(updated);
                        }
                      }}
                      required
                      style={{ color: '#000000' }}
                    >
                      <option value="">Select User</option>
                      {users.map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.full_name} ({user.company_name || 'Individual'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Destination *</label>
                    <input
                      type="text"
                      value={newEntry.destination}
                      onChange={(e) => setNewEntry({ ...newEntry, destination: e.target.value })}
                      placeholder="City"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input
                      type="text"
                      value={newEntry.product_name}
                      onChange={(e) => setNewEntry({ ...newEntry, product_name: e.target.value })}
                      placeholder="Product description"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Pieces</label>
                    <input
                      type="number"
                      value={newEntry.pieces}
                      onChange={(e) => setNewEntry({ ...newEntry, pieces: parseInt(e.target.value) || 1 })}
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Weight (kg) *</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newEntry.weight}
                      onChange={(e) => setNewEntry({ ...newEntry, weight: parseFloat(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Invoice No</label>
                    <select
                      value={newEntry.invoice_id}
                      onChange={(e) => {
                        const selectedInvoice = invoices.find(i => (i._id || i.id) === e.target.value);
                        setNewEntry({ 
                          ...newEntry, 
                          invoice_id: e.target.value,
                          invoice_no: selectedInvoice?.invoice_number || ''
                        });
                      }}
                      style={{ color: '#000000' }}
                    >
                      <option value="">Select Invoice (Optional)</option>
                      {invoices.map((invoice) => (
                        <option key={invoice._id || invoice.id} value={invoice._id || invoice.id}>
                          {invoice.invoice_number} - {invoice.customer_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <h3 className="section-title">Rate Card Selection</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Delivery Partner *</label>
                    <select
                      value={newEntry.delivery_partner}
                      onChange={(e) => {
                        const updated = { ...newEntry, delivery_partner: e.target.value };
                        setNewEntry(updated);
                        setRateCardFetched(false);
                        fetchRateCard(updated);
                      }}
                      required
                      style={{ color: '#000000' }}
                    >
                      <option value="">Select Partner</option>
                      {DELIVERY_PARTNERS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Service Type *</label>
                    <select
                      value={newEntry.service_type}
                      onChange={(e) => {
                        const updated = { 
                          ...newEntry, 
                          service_type: e.target.value,
                          region: '',
                          courier_zone: ''
                        };
                        setNewEntry(updated);
                        setRateCardFetched(false);
                        setRateCardError('');
                      }}
                      required
                      style={{ color: '#000000' }}
                    >
                      <option value="">Select Type</option>
                      {SERVICE_TYPES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Mode *</label>
                    <select
                      value={newEntry.mode}
                      onChange={(e) => {
                        const updated = { ...newEntry, mode: e.target.value };
                        setNewEntry(updated);
                        setRateCardFetched(false);
                        fetchRateCard(updated);
                      }}
                      required
                      style={{ color: '#000000' }}
                    >
                      <option value="">Select Mode</option>
                      {TRANSPORT_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {newEntry.service_type === 'cargo' && (
                    <div className="form-group">
                      <label>Region *</label>
                      <select
                        value={newEntry.region}
                        onChange={(e) => {
                          const updated = { ...newEntry, region: e.target.value };
                          setNewEntry(updated);
                          setRateCardFetched(false);
                          fetchRateCard(updated);
                        }}
                        required
                        style={{ color: '#000000' }}
                      >
                        <option value="">Select Region</option>
                        {CARGO_REGIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {newEntry.service_type === 'courier' && (
                    <div className="form-group">
                      <label>Zone *</label>
                      <select
                        value={newEntry.courier_zone}
                        onChange={(e) => {
                          const updated = { ...newEntry, courier_zone: e.target.value };
                          setNewEntry(updated);
                          setRateCardFetched(false);
                          fetchRateCard(updated);
                        }}
                        required
                        style={{ color: '#000000' }}
                      >
                        <option value="">Select Zone</option>
                        {COURIER_ZONES.map((z) => (
                          <option key={z.value} value={z.value}>{z.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label>Legacy Zone</label>
                    <select
                      value={newEntry.zone}
                      onChange={(e) => setNewEntry({ ...newEntry, zone: e.target.value })}
                      style={{ color: '#000000' }}
                    >
                      {ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Rate Card Status */}
                {rateCardLoading && (
                  <div className="alert" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', marginTop: '1rem' }}>
                    Loading rate card...
                  </div>
                )}
                {rateCardError && (
                  <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                    {rateCardError}
                  </div>
                )}
                {rateCardFetched && !rateCardError && (
                  <div className="alert" style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', marginTop: '1rem' }}>
                    ✓ Rate card applied successfully
                  </div>
                )}

                <h3 className="section-title">Pricing {rateCardFetched && <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 'normal' }}>(Auto-filled from rate card)</span>}</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Base Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newEntry.base_rate}
                      onChange={(e) => setNewEntry({ ...newEntry, base_rate: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>Docket Charges (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newEntry.docket_charges}
                      onChange={(e) => setNewEntry({ ...newEntry, docket_charges: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>ODI/ODA Charge (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newEntry.oda_charge}
                      onChange={(e) => setNewEntry({ ...newEntry, oda_charge: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>FOV (Multiplier)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newEntry.fov}
                      onChange={(e) => setNewEntry({ ...newEntry, fov: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>Fuel Charge (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newEntry.fuel_charge}
                      onChange={(e) => setNewEntry({ ...newEntry, fuel_charge: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>GST (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newEntry.gst}
                      onChange={(e) => setNewEntry({ ...newEntry, gst: parseFloat(e.target.value) || 0 })}
                      disabled={rateCardFetched}
                      style={rateCardFetched ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="form-group">
                    <label>Declared Value (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newEntry.value}
                      onChange={(e) => setNewEntry({ ...newEntry, value: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Total (₹)</label>
                    <input
                      type="text"
                      value={calculateTotal(newEntry).toFixed(2)}
                      disabled
                      className="total-field"
                    />
                  </div>
                </div>

                <h3 className="section-title">Box Dimensions (L×B×H)</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Box 1</label>
                    <input
                      type="text"
                      value={newEntry.box1_dimensions}
                      onChange={(e) => setNewEntry({ ...newEntry, box1_dimensions: e.target.value })}
                      placeholder="e.g., 830*15*10"
                    />
                  </div>
                  <div className="form-group">
                    <label>Box 2</label>
                    <input
                      type="text"
                      value={newEntry.box2_dimensions}
                      onChange={(e) => setNewEntry({ ...newEntry, box2_dimensions: e.target.value })}
                      placeholder="e.g., 830*15*10"
                    />
                  </div>
                  <div className="form-group">
                    <label>Box 3</label>
                    <input
                      type="text"
                      value={newEntry.box3_dimensions}
                      onChange={(e) => setNewEntry({ ...newEntry, box3_dimensions: e.target.value })}
                      placeholder="e.g., 830*15*10"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Save size={18} /> Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportModal({ onClose, onExport, totalConsignments, selectedCount }) {
  const [exportType, setExportType] = useState(selectedCount > 0 ? 'selected' : 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedZone, setSelectedZone] = useState('LOCAL');

  const handleExport = () => {
    onExport({ type: exportType, dateFrom, dateTo, zone: selectedZone });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Export Consignments</h2>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>What would you like to export?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="exportType"
                  value="all"
                  checked={exportType === 'all'}
                  onChange={(e) => setExportType(e.target.value)}
                />
                <span>All Consignments <strong>({totalConsignments} records)</strong></span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', opacity: selectedCount > 0 ? 1 : 0.6 }}>
                <input
                  type="radio"
                  name="exportType"
                  value="selected"
                  checked={exportType === 'selected'}
                  onChange={(e) => setExportType(e.target.value)}
                  disabled={selectedCount === 0}
                />
                <span>Selected Records <strong>({selectedCount} records)</strong></span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="exportType"
                  value="dateRange"
                  checked={exportType === 'dateRange'}
                  onChange={(e) => setExportType(e.target.value)}
                />
                <span>Custom Date Range</span>
              </label>

              {exportType === 'dateRange' && (
                <div style={{ marginLeft: '1.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.85rem' }}>From Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.85rem' }}>To Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="exportType"
                  value="zone"
                  checked={exportType === 'zone'}
                  onChange={(e) => setExportType(e.target.value)}
                />
                <span>Specific Zone</span>
              </label>

              {exportType === 'zone' && (
                <div style={{ marginLeft: '1.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.85rem' }}>Select Zone</label>
                    <select
                      value={selectedZone}
                      onChange={(e) => setSelectedZone(e.target.value)}
                    >
                      {ZONES.map((zone) => (
                        <option key={zone} value={zone}>{zone}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="alert" style={{ 
            marginTop: '1.5rem',
            padding: '0.75rem',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#0369a1'
          }}>
            <strong>Note:</strong> The exported Excel file will contain all columns including consignment details, pricing, and box dimensions.
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleExport}
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}

export default Consignments;
