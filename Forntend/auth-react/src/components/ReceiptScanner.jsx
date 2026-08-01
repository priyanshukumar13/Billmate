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
    <div className="bg-[#121212] border border-white/[0.06] rounded-2xl p-5 w-full text-white font-sans mt-5">
      <div className="flex items-center space-x-2 mb-4">
        <Sparkles className="w-5 h-5 text-[#F5A93B]" />
        <h3 className="text-base font-bold">AI Receipt Scanner</h3>
      </div>

      {!extractedData && !loading && (
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragActive 
              ? 'border-[#F5A93B] bg-[#F5A93B]/5' 
              : 'border-white/[0.08] hover:border-white/[0.2] bg-black/20'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-8 h-8 text-neutral-400 mx-auto mb-3" />
          <p className="text-xs font-semibold text-neutral-300">Drag & drop your receipt, or <span className="text-[#F5A93B] hover:underline">browse</span></p>
          <span className="block text-[10px] text-neutral-500 mt-1">Supports JPG, PNG, PDF up to 10MB</span>
        </div>
      )}

      {loading && (
        <div className="py-8 flex flex-col justify-center items-center">
          <Loader2 className="w-8 h-8 text-[#F5A93B] animate-spin mb-2" />
          <p className="text-xs text-neutral-400">Extracting text & categorizing bill...</p>
        </div>
      )}

      {extractedData && (
        <form onSubmit={handleSaveBill} className="space-y-4 pt-1">
          <div className="p-3 bg-neutral-900/60 border border-white/[0.04] rounded-xl flex items-center space-x-3 mb-2">
            <FileText className="w-8 h-8 text-[#F5A93B]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{file?.name}</p>
              <span className="text-[10px] text-neutral-500">Previewing AI Extraction</span>
            </div>
            {/* Highlight low confidence if fields are blank */}
            {(!extractedData.merchant || !extractedData.amount || !extractedData.due_date) && (
              <div className="flex items-center space-x-1 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full text-[9px] font-medium animate-pulse shrink-0">
                <AlertTriangle className="w-3 h-3" />
                <span>Verify Fields</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Merchant</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className={`w-full bg-neutral-950 border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A93B]/20 ${
                  !extractedData.merchant ? 'border-amber-500/50' : 'border-white/[0.08]'
                }`}
                placeholder="Merchant name"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full bg-neutral-950 border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A93B]/20 ${
                  !extractedData.amount ? 'border-amber-500/50' : 'border-white/[0.08]'
                }`}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`w-full bg-neutral-950 border rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A93B]/20 ${
                  !extractedData.due_date ? 'border-amber-500/50' : 'border-white/[0.08]'
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-neutral-950 border border-white/[0.08] rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#F5A93B]/20"
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
              className="flex-1 py-2 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-xs hover:shadow-[0_0_15px_rgba(245,169,59,0.3)] transition-all flex items-center justify-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Bill</span>
            </button>
          </div>
        </form>
      )}

      {isSuccess && (
        <div className="flex items-center justify-center space-x-2 text-green-400 bg-green-400/10 rounded-xl p-3 text-xs font-medium">
          <CheckCircle className="w-4 h-4" />
          <span>Receipt processed successfully!</span>
        </div>
      )}
    </div>
  );
}
