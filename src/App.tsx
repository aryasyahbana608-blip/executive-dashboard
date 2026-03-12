/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, ChangeEvent, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, MessageSquare, TrendingUp, BarChart3,
  Calendar, Save, History, Trash2, CheckCircle2,
  Info, Facebook, Instagram, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AdData, ViewerData, DashboardStats, MonthlyHistory } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

// ─── Konstanta ────────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'exec_dashboard_history';
const OLD_KEYS      = ['dashboard_history', 'dashboard_history_v2'];
const TARGET_VIEWER = 1_000_000;
const TARGET_CPL    = 5_000;

// ─── Cek apakah localStorage tersedia ────────────────────────────────────────
const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn('localStorage tidak tersedia:', e);
    return false;
  }
};

// ─── Load dari localStorage dengan error handling yang lebih baik ────────────
function loadHistoryFromStorage(): MonthlyHistory[] {
  // Jika localStorage tidak tersedia, return array kosong
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage tidak tersedia, tidak bisa load history');
    return [];
  }

  try {
    console.log('🔍 Mencoba load history dari localStorage...');
    
    // Coba key utama dulu
    const mainData = localStorage.getItem(STORAGE_KEY);
    if (mainData) {
      console.log('📦 Data ditemukan di key utama:', mainData.substring(0, 100) + '...');
      try {
        const parsed = JSON.parse(mainData);
        if (Array.isArray(parsed)) {
          console.log(`✅ Load success: ${parsed.length} bulan dari ${STORAGE_KEY}`);
          return parsed;
        } else {
          console.warn('⚠️ Data bukan array, akan coba key lain');
        }
      } catch (parseError) {
        console.error('❌ Gagal parse JSON dari key utama:', parseError);
        // Lanjut coba key lama
      }
    } else {
      console.log('📭 Tidak ada data di key utama');
    }

    // Fallback: coba key-key lama
    for (const key of OLD_KEYS) {
      const oldData = localStorage.getItem(key);
      if (oldData) {
        console.log(`📦 Data ditemukan di key lama: ${key}`);
        try {
          const parsed = JSON.parse(oldData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrasikan ke key baru
            console.log(`🔄 Migrasi ${parsed.length} bulan dari ${key} ke ${STORAGE_KEY}`);
            localStorage.setItem(STORAGE_KEY, oldData);
            localStorage.removeItem(key); // Hapus key lama
            return parsed;
          }
        } catch (parseError) {
          console.error(`❌ Gagal parse JSON dari key ${key}:`, parseError);
        }
      }
    }

    console.log('📂 Tidak ada history ditemukan, mulai dengan array kosong');
    return [];
  } catch (e) {
    console.error('❌ Gagal membaca localStorage:', e);
    return [];
  }
}

// ─── Simpan ke localStorage dengan verifikasi dan retry ──────────────────────
function saveHistoryToStorage(data: MonthlyHistory[]): boolean {
  // Jika localStorage tidak tersedia, return false
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage tidak tersedia, tidak bisa save history');
    return false;
  }

  try {
    const jsonString = JSON.stringify(data);
    console.log(`💾 Mencoba menyimpan ${data.length} bulan ke ${STORAGE_KEY}...`);
    
    // Simpan
    localStorage.setItem(STORAGE_KEY, jsonString);
    
    // Verifikasi: baca kembali
    const verifyData = localStorage.getItem(STORAGE_KEY);
    
    if (verifyData === jsonString) {
      console.log(`✅ Berhasil menyimpan dan verifikasi: ${data.length} bulan`);
      
      // Trigger event storage untuk komunikasi antar tab (opsional)
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: jsonString,
        oldValue: null
      }));
      
      return true;
    } else {
      console.error('❌ Verifikasi gagal - data tidak cocok setelah disimpan');
      console.log('Original:', jsonString.substring(0, 50) + '...');
      console.log('Verifikasi:', verifyData?.substring(0, 50) + '...');
      return false;
    }
  } catch (e) {
    console.error('❌ Gagal menyimpan ke localStorage:', e);
    return false;
  }
}

// ─── Toast Component ─────────────────────────────────────────────────────────
interface ToastProps { 
  message: string; 
  type: 'success' | 'info' | 'warning'; 
  onClose: () => void; 
}

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => { 
    const timer = setTimeout(onClose, 3500); 
    return () => clearTimeout(timer); 
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40, scale: 0.95 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold',
        type === 'success' && 'bg-emerald-600 text-white',
        type === 'info'    && 'bg-indigo-600 text-white',
        type === 'warning' && 'bg-amber-500 text-white'
      )}
    >
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      {message}
    </motion.div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────
export default function App() {
  const [adsData, setAdsData] = useState<AdData[]>([]);
  const [viewerData, setViewerData] = useState<ViewerData[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
  const [fileName, setFileName] = useState('');

  // Load history dengan useEffect terpisah untuk menghindari race condition
  const [history, setHistory] = useState<MonthlyHistory[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isStorageAvailable, setIsStorageAvailable] = useState<boolean>(true);

  const isMounted = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load history saat komponen mount ────────────────────────────────────
  useEffect(() => {
    const loadedHistory = loadHistoryFromStorage();
    setHistory(loadedHistory);
    setIsStorageAvailable(isLocalStorageAvailable());
    
    // Debug info
    console.log('🏁 App initialized');
    console.log('Storage available:', isLocalStorageAvailable());
    console.log('History loaded:', loadedHistory.length, 'items');
    
    // Listen untuk storage event dari tab lain (opsional)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const newHistory = JSON.parse(e.newValue);
          if (Array.isArray(newHistory)) {
            console.log('🔄 Storage changed from another tab, updating...');
            setHistory(newHistory);
          }
        } catch (error) {
          console.error('Error parsing storage event:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ─── Simpan ke localStorage dengan debounce ──────────────────────────────
  useEffect(() => {
    // Skip render pertama
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }

    // Clear timeout sebelumnya
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save untuk menghindari terlalu sering menyimpan
    saveTimeoutRef.current = setTimeout(() => {
      if (history.length > 0) {
        saveHistoryToStorage(history);
      } else {
        // Jika history kosong, hapus dari storage
        if (isLocalStorageAvailable()) {
          localStorage.removeItem(STORAGE_KEY);
          console.log('🗑️ Storage cleared (empty history)');
        }
      }
    }, 500); // Tunggu 500ms setelah perubahan terakhir

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [history]);

  // ─── Helper Functions ────────────────────────────────────────────────────
  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR', 
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val);
  };

  // ─── Force refresh dari storage ──────────────────────────────────────────
  const refreshFromStorage = () => {
    const freshHistory = loadHistoryFromStorage();
    setHistory(freshHistory);
    showToast('Data di-refresh dari storage', 'info');
  };

  // ─── Stats calculation (sama seperti sebelumnya) ─────────────────────────
  const stats = useMemo<DashboardStats>(() => {
    const totalViewers = viewerData.reduce((a, b) => a + (b.tayangan || 0), 0);
    const pctViewers   = Math.min((totalViewers / TARGET_VIEWER) * 100, 100);

    const convAds    = adsData.filter(d => d.indikator?.toLowerCase().includes('messaging_conversation'));
    const totalLeads = convAds.reduce((a, b) => a + (b.hasil || 0), 0);
    const totalSpend = convAds.reduce((a, b) => a + (b.spend || 0), 0);
    const avgCPL     = totalLeads > 0 ? totalSpend / totalLeads : 0;

    const sortedByCPL  = [...convAds].sort((a, b) => a.cpl - b.cpl);
    const qualifiedAds = sortedByCPL.filter(ad => ad.hasil > 10);
    const bestCampaign  = qualifiedAds[0]  ?? null;
    const worstCampaign = qualifiedAds[qualifiedAds.length - 1] ?? null;
    const top4    = qualifiedAds.slice(0, 4);
    const bottom4 = qualifiedAds.slice(-4).reverse();

    const calcCPL = (arr: AdData[]) => {
      const h = arr.reduce((a, b) => a + (b.hasil || 0), 0);
      const s = arr.reduce((a, b) => a + (b.spend || 0), 0);
      return h > 0 ? s / h : 0;
    };
    const cplFB = calcCPL(convAds.filter(d => d.platform === 'Facebook'));
    const cplIG = calcCPL(convAds.filter(d => d.platform === 'Instagram'));

    const engAds = adsData.filter(d =>
      d.indikator?.includes('post_engagement') || d.indikator?.includes('post_interaction')
    );
    const engFB = engAds.filter(d => d.platform === 'Facebook').reduce((a, b) => a + (b.hasil || 0), 0);
    const engIG = engAds.filter(d => d.platform === 'Instagram').reduce((a, b) => a + (b.hasil || 0), 0);

    const accounts = Array.from(new Set(adsData.map(ad => ad.accountName))).filter(Boolean);
    const accountStats = accounts.map(name => {
      const accAds  = adsData.filter(ad => ad.accountName === name);
      const accConv = accAds.filter(d => d.indikator?.toLowerCase().includes('messaging_conversation'));
      const leads   = accConv.reduce((a, b) => a + (b.hasil || 0), 0);
      const spend   = accConv.reduce((a, b) => a + (b.spend || 0), 0);
      const cpl     = leads > 0 ? spend / leads : 0;
      const accEng  = accAds.filter(d => d.indikator?.includes('post_engagement') || d.indikator?.includes('post_interaction'));
      return {
        name, leads, spend, cpl,
        engFB: accEng.filter(d => d.platform === 'Facebook').reduce((a, b) => a + (b.hasil || 0), 0),
        engIG: accEng.filter(d => d.platform === 'Instagram').reduce((a, b) => a + (b.hasil || 0), 0),
      };
    }).sort((a, b) => b.leads - a.leads);

    return { 
      totalViewers, pctViewers, totalLeads, totalSpend, avgCPL, 
      cplFB, cplIG, engFB, engIG, 
      bestCampaign, worstCampaign, top4, bottom4, accountStats 
    };
  }, [adsData, viewerData]);

  // ─── Save to history ─────────────────────────────────────────────────────
  const doSave = () => {
    const entry: MonthlyHistory = {
      month: selectedMonth, 
      viewers: stats.totalViewers,
      leads: stats.totalLeads, 
      spend: stats.totalSpend, 
      cpl: stats.avgCPL
    };
    
    setHistory(prev => {
      const filtered = prev.filter(h => h.month !== selectedMonth);
      const newHistory = [...filtered, entry].sort((a, b) => a.month.localeCompare(b.month));
      return newHistory;
    });
    
    setShowConfirm(false);
    const label = new Date(selectedMonth + '-01').toLocaleDateString('id-ID', { 
      month: 'long', 
      year: 'numeric' 
    });
    showToast(`Data ${label} berhasil disimpan!`, 'success');
  };

  const saveToHistory = () => {
    if (stats.totalViewers === 0 && stats.totalLeads === 0) {
      showToast('Tidak ada data. Unggah laporan terlebih dahulu.', 'warning');
      return;
    }
    
    if (history.find(h => h.month === selectedMonth)) {
      setShowConfirm(true);
    } else {
      doSave();
    }
  };

  const clearHistory = () => {
    setHistory([]);
    // Hapus juga semua key lama
    if (isLocalStorageAvailable()) {
      OLD_KEYS.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem(STORAGE_KEY);
    }
    showToast('Semua histori dihapus.', 'info');
  };

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setUploadStatus('analyzing');

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: 'array' });

        let newAdsData: AdData[] = [];
        const ws = workbook.Sheets['Worksheet'];
        if (ws) {
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
          if (rows.length > 0) {
            const head = (rows[0] as unknown[]).map(h => h ? h.toString().trim().toLowerCase() : '');
            const getIdx = (names: string[]) => {
              for (const n of names) { 
                const i = head.indexOf(n.toLowerCase()); 
                if (i !== -1) return i; 
              }
              return -1;
            };
            
            const iNama      = getIdx(['nama iklan', 'campaign name', 'ad name']);
            const iPlatform  = getIdx(['platform']);
            const iAccount   = getIdx(['akun', 'nama akun', 'account name', 'account']);
            const iHasil     = getIdx(['hasil', 'results', 'result']);
            const iIndikator = getIdx(['indikator hasil', 'result indicator', 'indicator']);
            const iCPL       = getIdx(['biaya per hasil', 'cost per result', 'cpl']);
            const iSpend     = getIdx(['jumlah yang dibelanjakan (idr)', 'amount spent', 'spend']);

            newAdsData = rows.slice(1)
              .filter(r => iNama !== -1 && (r as unknown[])[iNama])
              .map(r => {
                const row = r as unknown[];
                return {
                  platform:    iPlatform  >= 0 ? String(row[iPlatform]  ?? '') : 'Unknown',
                  accountName: iAccount   >= 0 ? String(row[iAccount]   ?? '') : 'Unknown Account',
                  nama:        iNama      >= 0 ? String(row[iNama]      ?? '') : 'Unnamed',
                  hasil:       iHasil     >= 0 ? parseNum(row[iHasil])         : 0,
                  indikator:   iIndikator >= 0 ? String(row[iIndikator] ?? '') : '',
                  cpl:         iCPL       >= 0 ? parseNum(row[iCPL])           : 0,
                  spend:       iSpend     >= 0 ? parseNum(row[iSpend])         : 0,
                };
              });
          }
        }

        let newViewerData: ViewerData[] = [];
        const vs = workbook.Sheets['Viewer'];
        if (vs) {
          const rows = XLSX.utils.sheet_to_json(vs, { header: 1 }) as unknown[][];
          let tIdx = -1, start = -1;
          for (let i = 0; i < rows.length; i++) {
            const f = (rows[i] as unknown[]).findIndex(c => c && c.toString().trim().toLowerCase() === 'tayangan');
            if (f !== -1) { 
              tIdx = f; 
              start = i + 1; 
              break; 
            }
          }
          if (tIdx !== -1) {
            newViewerData = rows.slice(start)
              .filter(r => (r as unknown[])[tIdx] !== undefined)
              .map(r => ({ tayangan: parseNum((r as unknown[])[tIdx]) }));
          }
        }

        setAdsData(newAdsData);
        setViewerData(newViewerData);
        setUploadStatus('success');
        showToast(`"${file.name}" berhasil dianalisis.`, 'success');
      } catch (err) {
        console.error(err);
        setUploadStatus('error');
        showToast('Gagal membaca file. Pastikan format kolom benar.', 'warning');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ─── Chart data ──────────────────────────────────────────────────────────
  const chartData = history.map(h => ({
    ...h,
    label: new Date(h.month + '-01').toLocaleDateString('id-ID', { 
      month: 'short', 
      year: '2-digit' 
    })
  }));

  const currentDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
                <Info className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 mb-2">Timpa Data?</h3>
              <p className="text-sm text-slate-500 mb-6">
                Data periode <strong className="text-slate-700">
                  {new Date(selectedMonth + '-01').toLocaleDateString('id-ID', { 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </strong> sudah ada. Ingin ditimpa dengan data baru?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Batal
                </button>
                <button 
                  onClick={doSave}
                  className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all"
                >
                  Ya, Timpa
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning jika storage tidak tersedia */}
      {!isStorageAvailable && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 text-sm">
          <Info className="w-4 h-4 inline mr-2" />
          localStorage tidak tersedia. Data tidak akan tersimpan permanen.
        </div>
      )}

      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-1 bg-indigo-600 rounded-full" />
            <h2 className="text-indigo-600 font-bold text-xs uppercase tracking-widest">
              Performance Analytics
            </h2>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight text-center md:text-left">
            Executive Dashboard
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 text-center md:text-left flex items-center justify-center md:justify-start gap-2">
            <Calendar className="w-4 h-4" />
            {currentDate}
          </p>
        </div>
        
        <div className="flex flex-col items-center md:items-end gap-3">
          <div className="flex flex-wrap justify-center md:justify-end gap-2">
            {uploadStatus === 'success' && (
              <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold px-3 focus:ring-0 cursor-pointer" 
                />
                <button 
                  onClick={saveToHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all hover:bg-indigo-700 active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan ke Histori
                </button>
                <button 
                  onClick={refreshFromStorage}
                  className="flex items-center gap-2 px-3 py-2 ml-1 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all hover:bg-slate-200 active:scale-95"
                  title="Refresh dari storage"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <label className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold cursor-pointer shadow-lg hover:bg-slate-800 active:scale-95 transition-all">
              <Upload className="w-5 h-5" />
              Unggah Laporan (.xlsx)
              <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls" />
            </label>
          </div>
          
          <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <div className={cn(
              'w-2 h-2 rounded-full transition-all',
              uploadStatus === 'idle'      && 'bg-slate-300',
              uploadStatus === 'analyzing' && 'bg-indigo-500 animate-ping',
              uploadStatus === 'success'   && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
              uploadStatus === 'error'     && 'bg-rose-500'
            )} />
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
              {uploadStatus === 'idle'      && 'Siap Menerima Data'}
              {uploadStatus === 'analyzing' && 'Menganalisis Data...'}
              {uploadStatus === 'success'   && `Laporan Aktif: ${fileName}`}
              {uploadStatus === 'error'     && 'Format File Salah / Kolom Tidak Dikenali'}
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Organic Viewers Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="stat-card bg-indigo-600 text-white shadow-xl shadow-indigo-100"
        >
          <div>
            <span className="target-label text-indigo-200">Organic Viewers</span>
            <div className="text-4xl md:text-5xl font-extrabold tracking-tighter">
              {stats.totalViewers.toLocaleString('id-ID')}
            </div>
          </div>
          <div className="mt-8 bg-indigo-700/40 p-5 rounded-[1.5rem] border border-indigo-400/20">
            <div className="w-full bg-indigo-900/30 rounded-full h-3 mb-2.5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${stats.pctViewers}%` }} 
                transition={{ duration: 1, ease: 'easeOut' }} 
                className="bg-white h-full rounded-full" 
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-black bg-white text-indigo-700 px-2.5 py-1 rounded-lg">
                {stats.pctViewers.toFixed(1)}% Goal
              </span>
              <span className="text-[10px] font-bold text-indigo-100 uppercase">Target 1jt</span>
            </div>
          </div>
        </motion.div>

        {/* Avg CPL Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
          className="stat-card bg-white text-slate-900 border border-slate-200 shadow-sm"
        >
          <div>
            <span className="target-label text-slate-400">Avg. Cost Per Lead</span>
            <div className={cn(
              'text-4xl md:text-5xl font-extrabold tracking-tighter transition-colors',
              stats.avgCPL > 0 
                ? (stats.avgCPL <= TARGET_CPL ? 'text-emerald-600' : 'text-rose-600') 
                : 'text-slate-900'
            )}>
              {formatIDR(stats.avgCPL)}
            </div>
          </div>
          <div className="mt-8 bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100 flex flex-col items-center justify-center min-h-[85px]">
            {stats.avgCPL > 0 ? (
              <div className={cn(
                'inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase',
                stats.avgCPL <= TARGET_CPL ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              )}>
                <span className={cn(
                  'w-2.5 h-2.5 rounded-full', 
                  stats.avgCPL <= TARGET_CPL ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                )} />
                {stats.avgCPL <= TARGET_CPL ? 'Efisien' : 'Over Budget'}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-slate-200 text-slate-500 uppercase">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Menunggu Data
              </div>
            )}
          </div>
        </motion.div>

        {/* Total Leads Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
          className="stat-card bg-emerald-600 text-white shadow-xl shadow-emerald-100"
        >
          <div>
            <span className="target-label text-emerald-100">Total Messaging Leads</span>
            <div className="text-4xl md:text-5xl font-extrabold tracking-tighter">
              {stats.totalLeads.toLocaleString('id-ID')}
            </div>
          </div>
          <div className="mt-8 bg-emerald-700/40 p-5 rounded-[1.5rem] border border-emerald-400/20 flex justify-between items-center min-h-[85px]">
            <div>
              <span className="text-[10px] text-emerald-100 font-bold uppercase block">Total Spend</span>
              <span className="text-lg font-black">{formatIDR(stats.totalSpend)}</span>
            </div>
            <div className="bg-emerald-500/30 p-2 rounded-xl">
              <MessageSquare className="h-6 w-6" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Monthly History Section */}
      <AnimatePresence>
        {history.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Monthly Performance Trends
                </h3>
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase">
                  {history.length} bulan
                </span>
              </div>
              <button 
                onClick={clearHistory}
                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all uppercase border border-transparent hover:border-rose-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset History
              </button>
            </div>

            <div className="mb-5 px-2">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <p className="text-[10px] font-bold text-emerald-700">
                  Histori tersimpan di key <code className="bg-emerald-100 px-1 rounded">{STORAGE_KEY}</code> — 
                  tetap ada meski tab ditutup & dibuka kembali.
                  {!isStorageAvailable && (
                    <span className="ml-2 text-amber-600">(localStorage tidak tersedia)</span>
                  )}
                </p>
              </div>
            </div>

            {/* History Table */}
            <div className="mb-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                      <th className="px-6 py-3">Periode</th>
                      <th className="px-6 py-3 text-right">Viewers</th>
                      <th className="px-6 py-3 text-right">Leads</th>
                      <th className="px-6 py-3 text-right">Avg CPL</th>
                      <th className="px-6 py-3 text-right">Total Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...history].reverse().map((h, i) => (
                      <tr 
                        key={i} 
                        className={cn(
                          'text-sm transition-all', 
                          h.month === selectedMonth ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                        )}
                      >
                        <td className="px-6 py-3 font-black text-slate-700">
                          {new Date(h.month + '-01').toLocaleDateString('id-ID', { 
                            month: 'long', 
                            year: 'numeric' 
                          })}
                          {h.month === selectedMonth && (
                            <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-600 text-[9px] font-black rounded-full uppercase">
                              Aktif
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-600">
                          {h.viewers.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-600">
                          {h.leads.toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-600">
                          {formatIDR(h.cpl)}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-600">
                          {formatIDR(h.spend)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts */}
            {chartData.length >= 2 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Viewers Chart */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                      Organic Viewers
                    </span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gViewers" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)', 
                            fontSize: '10px' 
                          }}
                          formatter={(v: number) => [v.toLocaleString('id-ID'), 'Viewers']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="viewers" 
                          stroke="#4f46e5" 
                          strokeWidth={3} 
                          fill="url(#gViewers)" 
                          dot={{ r: 3, fill: '#4f46e5' }} 
                          activeDot={{ r: 5 }} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Leads Chart */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Total Leads
                    </span>
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)', 
                            fontSize: '10px' 
                          }}
                          formatter={(v: number) => [v.toLocaleString('id-ID'), 'Leads']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="leads" 
                          stroke="#10b981" 
                          strokeWidth={3} 
                          fill="url(#gLeads)" 
                          dot={{ r: 3, fill: '#10b981' }} 
                          activeDot={{ r: 5 }} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* CPL Chart */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                      Avg. CPL
                    </span>
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gCPL" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis hide />
                        <ReferenceLine 
                          y={TARGET_CPL} 
                          stroke="#d97706" 
                          strokeDasharray="4 2" 
                          strokeOpacity={0.4} 
                        />
                        <Tooltip
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)', 
                            fontSize: '10px' 
                          }}
                          formatter={(v: number) => [formatIDR(v), 'CPL']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="cpl" 
                          stroke="#d97706" 
                          strokeWidth={3} 
                          fill="url(#gCPL)" 
                          dot={{ r: 3, fill: '#d97706' }} 
                          activeDot={{ r: 5 }} 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border border-dashed border-slate-200 px-8 py-10 text-center">
                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                </div>
                <p className="text-sm font-bold text-slate-500">
                  Simpan minimal <span className="text-indigo-600">2 bulan</span> untuk melihat grafik tren.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Baru ada <strong>{history.length}</strong> bulan tersimpan.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform CPL Section (diperbaiki dari dynamic className) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Platform CPL Efficiency</h3>
            <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full uppercase">
              Ads Data
            </span>
          </div>
          <div className="space-y-8">
            {/* Facebook CPL */}
            <div>
              <div className="flex justify-between items-end mb-2.5">
                <span className="text-xs font-black text-slate-500 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  Facebook
                </span>
                <span className="text-xl font-black text-blue-600">
                  {formatIDR(stats.cplFB)}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-5 rounded-2xl overflow-hidden p-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${stats.cplFB > 0 ? (stats.cplFB / Math.max(stats.cplFB, stats.cplIG, 1)) * 100 : 0}%` 
                  }}
                  className="bg-blue-500 h-full rounded-xl"
                />
              </div>
            </div>
            
            {/* Instagram CPL */}
            <div>
              <div className="flex justify-between items-end mb-2.5">
                <span className="text-xs font-black text-slate-500 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-pink-500" />
                  Instagram
                </span>
                <span className="text-xl font-black text-pink-600">
                  {formatIDR(stats.cplIG)}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-5 rounded-2xl overflow-hidden p-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${stats.cplIG > 0 ? (stats.cplIG / Math.max(stats.cplFB, stats.cplIG, 1)) * 100 : 0}%` 
                  }}
                  className="bg-pink-500 h-full rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Organic Engagement Section (diperbaiki dari dynamic className) */}
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white border border-slate-800">
          <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
            <h3 className="text-sm font-black text-indigo-300 uppercase tracking-widest">Organic Engagement</h3>
            <span className="px-3 py-1 bg-slate-800 text-indigo-300 text-[10px] font-black rounded-full uppercase">
              Post Metrics
            </span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {/* Facebook Engagement */}
            <div className="p-6 bg-slate-800/40 rounded-3xl border border-slate-700/50">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Facebook</span>
              <div className="text-4xl font-black text-white">
                {stats.engFB.toLocaleString('id-ID')}
              </div>
              <div className="mt-4 w-full bg-slate-700/50 h-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${stats.engFB > 0 ? (stats.engFB / Math.max(stats.engFB, stats.engIG, 1)) * 100 : 0}%` 
                  }}
                  className="bg-indigo-400 h-full"
                />
              </div>
            </div>
            
            {/* Instagram Engagement */}
            <div className="p-6 bg-slate-800/40 rounded-3xl border border-slate-700/50">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Instagram</span>
              <div className="text-4xl font-black text-white">
                {stats.engIG.toLocaleString('id-ID')}
              </div>
              <div className="mt-4 w-full bg-slate-700/50 h-2 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${stats.engIG > 0 ? (stats.engIG / Math.max(stats.engFB, stats.engIG, 1)) * 100 : 0}%` 
                  }}
                  className="bg-pink-400 h-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Breakdown Section (sama seperti sebelumnya) */}
      {stats.accountStats.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-12"
        >
          <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Account Performance Breakdown</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  CPL & Organic Engagement per Account
                </p>
              </div>
              <BarChart3 className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">
                  <tr>
                    <th className="px-10 py-5">Account Name</th>
                    <th className="px-6 py-5 text-center">Total Leads</th>
                    <th className="px-6 py-5 text-right">CPL Unit</th>
                    <th className="px-6 py-5 text-right">Spend</th>
                    <th className="px-6 py-5 text-center">FB Engagement</th>
                    <th className="px-6 py-5 text-center">IG Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stats.accountStats.map((acc, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-all">
                      <td className="px-10 py-6 text-sm font-black text-slate-800 uppercase">{acc.name}</td>
                      <td className="px-6 py-6 text-center text-sm font-black text-slate-700">
                        {acc.leads.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-6 text-right">
                        <span className={cn(
                          'text-sm font-black', 
                          acc.cpl > 0 
                            ? (acc.cpl <= TARGET_CPL ? 'text-emerald-600' : 'text-rose-600') 
                            : 'text-slate-400'
                        )}>
                          {formatIDR(acc.cpl)}
                        </span>
                      </td>
                      <td className="px-6 py-6 text-right text-xs font-bold text-slate-400">
                        {formatIDR(acc.spend)}
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Facebook className="w-3 h-3 text-blue-600" />
                          <span className="text-xs font-black text-slate-600">
                            {acc.engFB.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Instagram className="w-3 h-3 text-pink-600" />
                          <span className="text-xs font-black text-slate-600">
                            {acc.engIG.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Campaign Analysis Section (sama seperti sebelumnya) */}
      <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden mb-12">
        <div className="px-10 py-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/30">
          <div>
            <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Campaign Analysis</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              Messaging Conversion Focus
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-emerald-100 text-emerald-700">
                1
              </div>
              <div>
                <p className="text-[9px] font-black text-emerald-800 uppercase leading-none">
                  Best CPL (Results &gt; 10)
                </p>
                <p className="text-xs font-extrabold text-emerald-600">
                  {stats.bestCampaign?.nama || '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-rose-50 px-4 py-2 rounded-2xl border border-rose-100">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-rose-100 text-rose-700">
                !
              </div>
              <div>
                <p className="text-[9px] font-black text-rose-800 uppercase leading-none">
                  Worst CPL (Results &gt; 10)
                </p>
                <p className="text-xs font-extrabold text-rose-600">
                  {stats.worstCampaign?.nama || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">
              <tr>
                <th className="px-10 py-5 w-16">#</th>
                <th className="px-6 py-5">Account</th>
                <th className="px-6 py-5">Platform</th>
                <th className="px-6 py-5">Campaign Name</th>
                <th className="px-6 py-5 text-center">Results</th>
                <th className="px-6 py-5 text-right">CPL Unit</th>
                <th className="px-10 py-5 text-right">Total Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.top4.length > 0 ? (
                <>
                  {/* Top 4 Best */}
                  <tr>
                    <td colSpan={7} className="px-10 py-3 bg-emerald-50 text-[10px] font-black text-emerald-700 uppercase tracking-widest border-y border-emerald-100">
                      Top 4 Best Efficiency (Lowest CPL, Results &gt; 10)
                    </td>
                  </tr>
                  {stats.top4.map((ad, idx) => (
                    <tr key={`top-${idx}`} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-10 py-6">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-emerald-100 text-emerald-700">
                          {idx + 1}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase">
                        {ad.accountName}
                      </td>
                      <td className="px-6 py-6">
                        <span className={cn(
                          'platform-pill',
                          ad.platform === 'Facebook' 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-pink-100 text-pink-700 border border-pink-200'
                        )}>
                          {ad.platform}
                        </span>
                      </td>
                      <td className="px-6 py-6 font-bold text-slate-700 group-hover:text-indigo-600">
                        {ad.nama}
                      </td>
                      <td className="px-6 py-6 text-center font-black text-slate-800">
                        {ad.hasil.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-6 text-right font-black text-emerald-600 bg-emerald-50/30">
                        {formatIDR(ad.cpl)}
                      </td>
                      <td className="px-10 py-6 text-right font-bold text-slate-400">
                        {formatIDR(ad.spend)}
                      </td>
                    </tr>
                  ))}

                  {/* Top 4 Worst */}
                  <tr>
                    <td colSpan={7} className="px-10 py-3 bg-rose-50 text-[10px] font-black text-rose-700 uppercase tracking-widest border-y border-rose-100">
                      Top 4 Worst Efficiency (Highest CPL, Results &gt; 10)
                    </td>
                  </tr>
                  {stats.bottom4.map((ad, idx) => (
                    <tr key={`bottom-${idx}`} className="hover:bg-slate-50/80 transition-all group">
                      <td className="px-10 py-6">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black bg-rose-100 text-rose-700">
                          {idx + 1}
                        </div>
                      </td>
                      <td className="px-6 py-6 text-[10px] font-black text-slate-500 uppercase">
                        {ad.accountName}
                      </td>
                      <td className="px-6 py-6">
                        <span className={cn(
                          'platform-pill',
                          ad.platform === 'Facebook' 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-pink-100 text-pink-700 border border-pink-200'
                        )}>
                          {ad.platform}
                        </span>
                      </td>
                      <td className="px-6 py-6 font-bold text-slate-700 group-hover:text-indigo-600">
                        {ad.nama}
                      </td>
                      <td className="px-6 py-6 text-center font-black text-slate-800">
                        {ad.hasil.toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-6 text-right font-black text-rose-600 bg-rose-50/30">
                        {formatIDR(ad.cpl)}
                      </td>
                      <td className="px-10 py-6 text-right font-bold text-slate-400">
                        {formatIDR(ad.spend)}
                      </td>
                    </tr>
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={7} className="px-10 py-24 text-center text-slate-400 font-bold italic text-lg">
                    Upload data untuk melihat analisis kampanye terbaik/terburuk
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}