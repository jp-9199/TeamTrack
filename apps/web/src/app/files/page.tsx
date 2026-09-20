'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { useAuth } from '../../components/auth/AuthContext';
import {
  FileBox,
  FileCode,
  FileText,
  FileSpreadsheet,
  Image,
  Upload,
  Download,
  Eye,
  LayoutGrid,
  List,
  Search,
  HardDrive,
  X,
  Copy,
  Check,
} from 'lucide-react';

interface StudioFile {
  id: string;
  name: string;
  category: 'code' | 'docs' | 'sheets' | 'media' | 'general';
  sizeBytes: number;
  uploadedBy: string;
  modifiedAt: string;
  previewContent?: string;
  extension: string;
  downloadUrl?: string;
}

export default function FilesHubPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<StudioFile | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<StudioFile[]>([]);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('teamtrack_access_token') || localStorage.getItem('token') || '';
  };

  const categorizeFile = (name: string): 'code' | 'docs' | 'sheets' | 'media' | 'general' => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'yml', 'yaml', 'html', 'css', 'sql'].includes(ext)) return 'code';
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'docs';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheets';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'mov'].includes(ext)) return 'media';
    return 'general';
  };

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    const token = getAuthToken();
    try {
      const res = await fetch('/api/v1/files', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => r.json());

      if (res.success && Array.isArray(res.data?.files)) {
        const mapped: StudioFile[] = res.data.files.map((f: any) => ({
          id: f.id,
          name: f.fileName,
          category: categorizeFile(f.fileName),
          sizeBytes: f.fileSizeBytes || 0,
          uploadedBy: f.uploaderName || 'Team Member',
          modifiedAt: new Date(f.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          extension: f.fileName.split('.').pop() || 'bin',
          downloadUrl: f.downloadUrl,
        }));
        setFiles(mapped);
      } else {
        setFiles([]);
      }
    } catch {
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    const file = uploadedFiles[0];

    setIsUploading(true);
    const token = getAuthToken();

    try {
      const res = await fetch('/api/v1/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        }),
      }).then((r) => r.json());

      if (res.success && res.data?.file) {
        loadFiles();
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredFiles = files.filter((f) => {
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    if (searchQuery.trim() && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getFileIcon = (category: string) => {
    switch (category) {
      case 'code':
        return <FileCode className="w-5 h-5 text-indigo-500" strokeWidth={1.65} />;
      case 'docs':
        return <FileText className="w-5 h-5 text-rose-500" strokeWidth={1.65} />;
      case 'sheets':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-500" strokeWidth={1.65} />;
      case 'media':
        return <Image className="w-5 h-5 text-cyan-500" strokeWidth={1.65} />;
      default:
        return <FileBox className="w-5 h-5 text-amber-500" strokeWidth={1.65} />;
    }
  };

  // ── SECONDARY SIDEBAR: STORAGE CATEGORIES ──
  const sidebar = (
    <div className="flex flex-col h-full bg-slate-50/90 dark:bg-[#0B1120]/95 text-slate-800 dark:text-slate-100 p-3 select-none border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-bold tracking-tight">Files Hub</h2>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-1">
        {[
          { id: 'all', label: 'All Files', count: files.length },
          { id: 'code', label: 'Code & Scripts', count: files.filter((f) => f.category === 'code').length },
          { id: 'docs', label: 'Documents & PDFs', count: files.filter((f) => f.category === 'docs').length },
          { id: 'sheets', label: 'Sheets & Data', count: files.filter((f) => f.category === 'sheets').length },
          { id: 'media', label: 'Media & Images', count: files.filter((f) => f.category === 'media').length },
        ].map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs ring-1 ring-slate-200 dark:ring-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[11px] text-slate-400 font-semibold">{cat.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="files">
      <div className="flex flex-col h-full bg-slate-50/40 dark:bg-[#090D16]/40 text-slate-800 dark:text-slate-100 overflow-hidden">
        {/* Top Control Bar */}
        <div className="h-14 px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-[#090D16]/70 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.65} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files by filename..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-400'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.65} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-400'
                }`}
                title="List view"
              >
                <List className="w-4 h-4" strokeWidth={1.65} />
              </button>
            </div>

            {/* Hidden Input for Real Upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              className="hidden"
            />

            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" strokeWidth={1.65} />
              <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
            </button>
          </div>
        </div>

        {/* Files Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="py-20 text-center text-slate-400 text-xs">Loading files...</div>
          ) : filteredFiles.length === 0 ? (
            <div className="py-16 text-center max-w-sm mx-auto">
              <FileBox className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No files uploaded</p>
              <p className="text-xs text-slate-400 mt-1">Upload files or documents to share them across your workspace.</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setPreviewFile(file)}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                        {getFileIcon(file.category)}
                      </div>
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {file.extension}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {file.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {formatFileSize(file.sizeBytes)} • {file.modifiedAt}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-400">
                    <span className="truncate text-[11px]">{file.uploadedBy}</span>
                    <Eye className="w-3.5 h-3.5 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="p-3.5 font-semibold">File Name</th>
                    <th className="p-3.5 font-semibold">Author</th>
                    <th className="p-3.5 font-semibold">Size</th>
                    <th className="p-3.5 font-semibold">Modified</th>
                    <th className="p-3.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.id}
                      onClick={() => setPreviewFile(file)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5 flex items-center gap-3">
                        {getFileIcon(file.category)}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{file.name}</span>
                      </td>
                      <td className="p-3.5 text-slate-400">{file.uploadedBy}</td>
                      <td className="p-3.5 text-slate-400 font-mono">{formatFileSize(file.sizeBytes)}</td>
                      <td className="p-3.5 text-slate-400">{file.modifiedAt}</td>
                      <td className="p-3.5 text-right">
                        <button className="p-1 rounded-lg text-slate-400 hover:text-indigo-500">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── FILE DETAILS MODAL ── */}
        {previewFile && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => setPreviewFile(null)}
          >
            <div
              className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  {getFileIcon(previewFile.category)}
                  <div>
                    <h3 className="text-sm font-bold">{previewFile.name}</h3>
                    <p className="text-[11px] text-slate-400">
                      {formatFileSize(previewFile.sizeBytes)} • Uploaded by {previewFile.uploadedBy}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 font-mono text-xs leading-relaxed bg-slate-50 dark:bg-[#0B1120] text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                <div>File ID: {previewFile.id}</div>
                <div>Size: {formatFileSize(previewFile.sizeBytes)}</div>
                <div>Uploaded on: {previewFile.modifiedAt}</div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 text-xs">
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  Close
                </button>
                {previewFile.downloadUrl && (
                  <a
                    href={previewFile.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </TeamsShell>
  );
}
