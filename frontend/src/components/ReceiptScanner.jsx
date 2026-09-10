import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle, AlertTriangle, Save, Loader2, Sparkles } from 'lucide-react';

export default function ReceiptScanner() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [receiptId, setReceiptId] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form edit states
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('Bills');
  const [notes, setNotes] = useState('');

  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:5000"
      : "https://billmate-backend.onrender.com");

  const token = localStorage.getItem("billmateToken");

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);
    setLoading(true);
    setExtractedData(null);
    setIsSuccess(false);

    const formData = new FormData();
    formData.append('receipt', uploadedFile);

    try {
      const res = await fetch(`${BASE_URL}/api/receipts/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.msg || 'Failed to scan receipt.');
      }

      const data = await res.json();
      setReceiptId(data.receiptId);
      setExtractedData(data.preview);
      
      // Seed form values
      setMerchant(data.preview.merchant || '');
      setAmount(data.preview.amount || '');
      // Format YYYY-MM-DD
      const dateVal = data.preview.due_date ? data.preview.due_date.split('T')[0] : '';
      setDueDate(dateVal);
      setCategory(data.preview.category || 'Bills');
      setNotes(data.preview.notes || '');

    } catch (err) {
      console.error(err);
      alert(err.message || 'Error processing receipt scanner.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const handleSaveBill = async (e) => {
    e.preventDefault();
    if (!merchant || !amount || !dueDate) {
      alert("Please fill in Merchant, Amount, and Due Date.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/receipts/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiptId,
          name: merchant,
          amount: parseFloat(amount),
          date: dueDate,
          category
        })
      });

      if (!res.ok) {
        throw new Error('Could not save scanned bill.');
      }

      setIsSuccess(true);
      setExtractedData(null);
      setFile(null);

      // Alert & reload the parent HTML page to refresh charts/lists
      alert("Receipt bill added successfully!");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error saving scanned bill.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full text-slate-800 font-sans mt-5 shadow-sm">
      <div className="flex items-center space-x-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h3 className="text-base font-bold">AI Receipt Scanner</h3>
      </div>

      {!extractedData && !loading && (
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragActive 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Drag & drop your receipt, or <span className="text-blue-600 hover:underline">browse</span></p>
          <span className="block text-[10px] text-slate-500 mt-1">Supports JPG, PNG, PDF up to 10MB</span>
        </div>
      )}

      {loading && (
        <div className="py-8 flex flex-col justify-center items-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
          <p className="text-xs text-slate-500">Extracting text & categorizing bill...</p>
        </div>
      )}

      {extractedData && (
        <form onSubmit={handleSaveBill} className="space-y-4 pt-1">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-3 mb-2 shadow-sm">
            <FileText className="w-8 h-8 text-blue-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 truncate">{file?.name}</p>
              <span className="text-[10px] text-slate-500">Previewing AI Extraction</span>
            </div>
            {/* Highlight low confidence if fields are blank */}
            {(!extractedData.merchant || !extractedData.amount || !extractedData.due_date) && (
              <div className="flex items-center space-x-1 text-amber-600 bg-amber-50 px-2 py-0.5 border border-amber-200 rounded-full text-[9px] font-medium animate-pulse shrink-0">
                <AlertTriangle className="w-3 h-3" />
                <span>Verify Fields</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Merchant</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className={`w-full bg-white border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                  !extractedData.merchant ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200 focus:border-blue-500'
                }`}
                placeholder="Merchant name"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full bg-white border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                  !extractedData.amount ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200 focus:border-blue-500'
                }`}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`w-full bg-white border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                  !extractedData.due_date ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200 focus:border-blue-500'
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
              >
                <option value="Rent">Rent</option>
                <option value="Food">Food</option>
                <option value="Bills">Bills</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setExtractedData(null);
                setFile(null);
              }}
              className="flex-1 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 text-white font-semibold rounded-xl text-xs hover:bg-blue-700 hover:shadow-lg transition-all flex items-center justify-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Bill</span>
            </button>
          </div>
        </form>
      )}

      {isSuccess && (
        <div className="flex items-center justify-center space-x-2 text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 text-xs font-medium mt-4">
          <CheckCircle className="w-4 h-4" />
          <span>Receipt processed successfully!</span>
        </div>
      )}
    </div>
  );
}
