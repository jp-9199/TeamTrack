'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TeamsShell } from '../../components/layout/TeamsShell';
import { Tooltip } from '@fluentui/react-components';
import {
  FolderRegular,
  FolderFilled,
  DocumentRegular,
  DocumentPdfRegular,
  ArrowUploadRegular,
  ArrowDownloadRegular,
  GridRegular,
  ListRegular,
  SearchRegular,
  CloudRegular,
  ClockRegular,
  DeleteRegular,
  ShareRegular,
  EyeRegular,
  DismissRegular,
  CheckmarkRegular,
  AddRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../components/auth/AuthContext';

interface CloudFile {
  id: string;
  name: string;
  category: 'recent' | 'my_files' | 'teams_files' | 'downloads';
  location: string;
  type: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image' | 'code' | 'zip';
  sizeBytes: number;
  modifiedAt: string;
  modifiedBy: string;
  previewContent?: string;
}

export default function FilesHubPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeCategory, setActiveCategory] = useState<'recent' | 'my_files' | 'teams_files' | 'downloads'>('recent');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<CloudFile | null>(null);

  // Live state without dummy data
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // 1. Fetch real files from backend channels
  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    const token = localStorage.getItem('token') || 'demo-user-token';
    try {
      const res = await fetch('/api/v1/channels/general/files', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data?.files) {
        const mappedFiles: CloudFile[] = data.data.files.map((f: any) => {
          let fileType: CloudFile['type'] = 'word';
          if (f.mimeType?.includes('pdf') || f.fileName.endsWith('.pdf')) fileType = 'pdf';
          else if (f.mimeType?.includes('sheet') || f.fileName.endsWith('.xlsx')) fileType = 'excel';
          else if (f.mimeType?.includes('presentation') || f.fileName.endsWith('.pptx')) fileType = 'powerpoint';
          else if (f.mimeType?.includes('image') || f.fileName.endsWith('.png')) fileType = 'image';

          return {
            id: f.id,
            name: f.fileName,
            category: 'teams_files',
            location: 'Teams > General',
            type: fileType,
            sizeBytes: f.fileSizeBytes || 0,
            modifiedAt: new Date(f.createdAt).toLocaleDateString(),
            modifiedBy: f.uploaderName || 'Team Member',
          };
        });
        setFiles(mappedFiles);
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
    fetchFiles();
  }, [fetchFiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const file = uploadedFiles[0];
    setIsUploading(true);

    const token = localStorage.getItem('token') || 'demo-user-token';
    const formData = new FormData();
    formData.append('file', file);

    try {
      await fetch('/api/v1/channels/general/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      await fetchFiles();
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (type: CloudFile['type']) => {
    switch (type) {
      case 'pdf':
        return <DocumentPdfRegular fontSize={24} className="text-[#D83B01]" />;
      case 'excel':
        return <DocumentRegular fontSize={24} className="text-[#107C10]" />;
      case 'powerpoint':
        return <DocumentRegular fontSize={24} className="text-[#C4314B]" />;
      default:
        return <DocumentRegular fontSize={24} className="text-[#0078D4]" />;
    }
  };

  const filteredFiles = files.filter((f) => {
    if (activeCategory === 'recent' || f.category === activeCategory) {
      if (searchQuery.trim() && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    }
    return false;
  });

  const storageUsedBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const storageTotalBytes = 100 * 1024 * 1024; // 100 MB free quota
  const storagePercent = Math.min(100, Math.round((storageUsedBytes / storageTotalBytes) * 100));

  // ── SECONDARY SIDEBAR: FILES NAVIGATION ──
  const sidebar = (
    <div className="flex flex-col h-full bg-[#ECEEF0] select-none text-[#242424]">
      {/* Sidebar Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight">Files</h2>
      </div>

      {/* Nav Menu Items */}
      <div className="px-2 space-y-1 mt-1">
        {[
          { id: 'recent', label: 'Recent', icon: <ClockRegular fontSize={18} /> },
          { id: 'my_files', label: 'My files', icon: <CloudRegular fontSize={18} /> },
          { id: 'teams_files', label: 'Teams files', icon: <FolderRegular fontSize={18} /> },
          { id: 'downloads', label: 'Downloads', icon: <ArrowDownloadRegular fontSize={18} /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveCategory(item.id as any)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
              activeCategory === item.id
                ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-[#5B5FC7] font-bold ring-1 ring-black/5'
                : 'text-[#424242] hover:bg-black/5 hover:text-[#242424]'
            }`}
          >
            <span className={activeCategory === item.id ? 'text-[#5B5FC7]' : 'text-[#616161]'}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Cloud Storage Usage Card */}
      <div className="mt-auto p-4 m-2 bg-white rounded-2xl border border-[#E1DFDD] shadow-xs">
        <div className="flex items-center justify-between text-[11.5px] font-bold mb-1.5 text-[#242424]">
          <span>Cloud Storage</span>
          <span className="text-[#616161]">{storagePercent}% used</span>
        </div>
        <div className="w-full h-1.5 bg-[#F3F2F1] rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[#5B5FC7] rounded-full transition-all duration-300"
            style={{ width: `${Math.max(4, storagePercent)}%` }}
          />
        </div>
        <p className="text-[11px] text-[#8A8886]">
          {Math.round(storageUsedBytes / (1024 * 1024))} MB of 100 MB used
        </p>
      </div>
    </div>
  );

  return (
    <TeamsShell sidebar={sidebar} activeApp="files">
      {/* ── ACTIVE CANVAS: FILES HUB STAGE ── */}
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {/* Action Header */}
        <header className="px-8 py-4 border-b border-[#E1DFDD] bg-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <h1 className="text-[19px] font-bold text-[#242424] capitalize">
              {activeCategory.replace('_', ' ')}
            </h1>
            <span className="text-[12px] text-[#616161] bg-[#F5F5F5] px-2 py-0.5 rounded-full font-medium">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search filter */}
            <div className="relative flex items-center">
              <SearchRegular fontSize={14} className="absolute left-2.5 text-[#616161]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="w-48 bg-white border border-[#D1D5DB] rounded-lg pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-[#5B5FC7] placeholder-[#707070]"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-[#F5F5F5] p-0.5 rounded-lg border border-[#E1DFDD]">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-all cursor-pointer ${
                  viewMode === 'list' ? 'bg-white shadow-xs text-[#242424]' : 'text-[#616161]'
                }`}
                title="List view"
              >
                <ListRegular fontSize={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-all cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white shadow-xs text-[#242424]' : 'text-[#616161]'
                }`}
                title="Grid view"
              >
                <GridRegular fontSize={16} />
              </button>
            </div>

            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3.5 py-1.5 bg-[#5B5FC7] text-white rounded-lg text-[12.5px] font-semibold hover:bg-[#4F52B2] transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <ArrowUploadRegular fontSize={16} />
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </header>

        {/* Files Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#FAF9F8]">
          {isLoading ? (
            <div className="py-16 text-center text-[#616161] text-[13px]">Loading files...</div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#616161] bg-white rounded-2xl border border-[#E1DFDD]">
              <div className="w-16 h-16 rounded-full bg-[#EBEAF9] text-[#5B5FC7] flex items-center justify-center mb-3">
                <FolderRegular fontSize={32} />
              </div>
              <h3 className="text-[18px] font-bold text-[#242424]">No files found</h3>
              <p className="text-[13px] text-[#707070] mt-1 max-w-sm">
                Upload documents, spreadsheets, or presentations to share and collaborate with your team.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 bg-[#5B5FC7] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#4F52B2] shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <ArrowUploadRegular fontSize={16} />
                Upload a file
              </button>
            </div>
          ) : viewMode === 'list' ? (
            /* LIST VIEW */
            <div className="bg-white rounded-2xl border border-[#E1DFDD] overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#E1DFDD] bg-[#FAF9F8] text-[#616161] font-semibold">
                    <th className="py-3 px-6">Name</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Modified</th>
                    <th className="py-3 px-4">Modified By</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.id}
                      className="border-b border-[#F3F2F1] hover:bg-black/5 transition-colors group cursor-pointer"
                      onClick={() => setPreviewFile(file)}
                    >
                      <td className="py-3 px-6 font-semibold text-[#242424] flex items-center gap-3">
                        {getFileIcon(file.type)}
                        <span className="truncate max-w-sm">{file.name}</span>
                      </td>
                      <td className="py-3 px-4 text-[#616161]">{file.location}</td>
                      <td className="py-3 px-4 text-[#616161]">{file.modifiedAt}</td>
                      <td className="py-3 px-4 text-[#424242]">{file.modifiedBy}</td>
                      <td className="py-3 px-4 text-[#616161]">
                        {Math.round(file.sizeBytes / 1024)} KB
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewFile(file);
                          }}
                          className="p-1.5 hover:bg-[#5B5FC7]/10 text-[#5B5FC7] rounded-lg transition-colors mr-1"
                          title="Preview"
                        >
                          <EyeRegular fontSize={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* GRID VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setPreviewFile(file)}
                  className="bg-white p-4 rounded-2xl border border-[#E1DFDD] shadow-xs hover:shadow-md hover:border-[#5B5FC7]/40 transition-all cursor-pointer flex flex-col justify-between h-44"
                >
                  <div className="flex items-start justify-between">
                    {getFileIcon(file.type)}
                  </div>

                  <div>
                    <h4 className="text-[13px] font-bold text-[#242424] truncate">{file.name}</h4>
                    <p className="text-[11px] text-[#8A8886] mt-0.5">{file.location}</p>
                  </div>

                  <div className="pt-2 border-t border-[#F3F2F1] flex items-center justify-between text-[11px] text-[#616161]">
                    <span>{Math.round(file.sizeBytes / 1024)} KB</span>
                    <span>{file.modifiedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FILE PREVIEW MODAL ── */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#E1DFDD] w-[600px] overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-[#E1DFDD] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 truncate pr-4">
                {getFileIcon(previewFile.type)}
                <h3 className="text-[15px] font-bold text-[#242424] truncate">{previewFile.name}</h3>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 text-[#616161] hover:text-[#242424] rounded-md cursor-pointer"
              >
                <DismissRegular fontSize={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-[#FAF9F8]">
              <div className="bg-white p-6 rounded-xl border border-[#E1DFDD] shadow-xs">
                <h4 className="text-[14px] font-bold text-[#242424] mb-2">{previewFile.name}</h4>
                <div className="space-y-1.5 text-[12px] text-[#616161] mb-4">
                  <p>Location: <strong className="text-[#242424]">{previewFile.location}</strong></p>
                  <p>Modified: <strong className="text-[#242424]">{previewFile.modifiedAt}</strong></p>
                  <p>Modified by: <strong className="text-[#242424]">{previewFile.modifiedBy}</strong></p>
                  <p>File Size: <strong className="text-[#242424]">{Math.round(previewFile.sizeBytes / 1024)} KB</strong></p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-[#E1DFDD] bg-white flex items-center justify-end shrink-0">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-4 py-1.5 bg-[#5B5FC7] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#4F52B2] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </TeamsShell>
  );
}
