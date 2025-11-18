import React, { useState, useEffect } from 'react';
import { Upload, Download, Users, Activity, Clock, TrendingUp, X, Folder, FileText } from 'lucide-react';

const P2PFileTransfer = () => {
  // State Management
  const [connected, setConnected] = useState(true);
  const [peerCount, setPeerCount] = useState(6);
  const [sharedFiles, setSharedFiles] = useState([
    { id: 1, name: 'report.pdf', size: 2.3 },
    { id: 2, name: 'data.xlsx', size: 5.1 }
  ]);
  const [activeDownloads, setActiveDownloads] = useState([
    { id: 1, name: 'video.mpa', peer: 'peer_A3F2', progress: 75, speed: 2.3 }
  ]);
  const [activeUploads, setActiveUploads] = useState([
    { id: 1, name: 'document.pdf', peer: 'peer_B7D9', progress: 40, speed: 2.3 },
    { id: 2, name: 'archive.zip', peer: 'peer_B7D9', progress: 65, speed: 2.3 }
  ]);
  const [transferQueue1, setTransferQueue1] = useState([
    { id: 1, name: 'report.pdf', size: 2.3 },
    { id: 2, name: 'data.xxxx', size: 5.1 }
  ]);
  const [transferQueue2, setTransferQueue2] = useState([
    { id: 1, name: 'budget.xlsx from Alice.bb', size: 4.2 },
    { id: 2, name: 'presentum...', size: 89 }
  ]);
  const [availableFiles, setAvailableFiles] = useState([
    { id: 1, name: 'slides.pptx pple)', priority: true },
    { id: 2, name: 'data.ajrg', size: 4.2 }
  ]);
  const [stats, setStats] = useState({
    connections: 5,
    maxConnections: 7,
    avgQueueTime: 12,
    completedToday: 23,
    failed: 2,
    speedHistory: [0.8, 1.2, 1.8, 1.4, 1.9, 1.6, 1.3, 1.8]
  });
  const [dragActive, setDragActive] = useState(false);

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update download progress
      setActiveDownloads(prev => prev.map(dl => ({
        ...dl,
        progress: Math.min(dl.progress + Math.random() * 2, 100)
      })).filter(d => d.progress < 100));

      // Update upload progress
      setActiveUploads(prev => prev.map(up => ({
        ...up,
        progress: Math.min(up.progress + Math.random() * 2, 100)
      })).filter(u => u.progress < 100));

      // Update speed history
      setStats(prev => ({
        ...prev,
        speedHistory: [...prev.speedHistory.slice(1), (Math.random() * 2 + 0.5).toFixed(1)]
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // File upload handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      addFile(file);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      addFile(e.target.files[0]);
    }
  };

  const addFile = (file) => {
    const newFile = {
      id: Date.now(),
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1)
    };
    setSharedFiles(prev => [...prev, newFile]);
  };

  const removeFile = (id) => {
    setSharedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      {/* Top Bar */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">P22 Transfer</h1>
        <input
          type="text"
          placeholder="Search"
          className="bg-gray-700 rounded px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm">Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">{peerCount} Peers</span>
          </div>
        </div>
      </div>

      {/* Top Cards - Active Transfers */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Active Downloads */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" />
            Active Downloads
          </h3>
          {activeDownloads.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No active downloads</p>
          ) : (
            activeDownloads.map(dl => (
              <div key={dl.id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-blue-400">{dl.name}</p>
                  <span className="text-xs text-gray-400">{dl.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${dl.progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500">From: {dl.peer}</p>
              </div>
            ))
          )}
        </div>

        {/* Active Uploads 1 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4 text-orange-400" />
            Active Uploads
          </h3>
          {activeUploads[0] && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-orange-400">{activeUploads[0].name}</p>
                <span className="text-xs text-gray-400">{activeUploads[0].progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-orange-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${activeUploads[0].progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500">{activeUploads[0].speed} MB/s</p>
            </div>
          )}
        </div>

        {/* Active Uploads 2 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4 text-green-400" />
            Active Uploads
          </h3>
          {activeUploads[1] && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-green-400">{activeUploads[1].name}</p>
                <span className="text-xs text-gray-400">{activeUploads[1].progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${activeUploads[1].progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500">From: {activeUploads[1].peer}</p>
            </div>
          )}
        </div>

        {/* Network Speed Graph */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Folder className="w-4 h-4 text-cyan-400" />
            Confore tiores
          </h3>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">↑ 1.8 MB/s</span>
          </div>
          <div className="h-16 flex items-end gap-1">
            {stats.speedHistory.map((speed, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-cyan-500 to-blue-400 rounded-t transition-all"
                style={{ height: `${(speed / 2) * 100}%` }}
              ></div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle Section */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Your Shared Files */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Folder className="w-4 h-4 text-blue-400" />
            Your Shared Files
          </h3>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 mb-3 text-center cursor-pointer transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'
            }`}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <Folder className="w-8 h-8 mx-auto mb-2 text-gray-500" />
            <p className="text-xs text-gray-400">Drag & Drop Files Here</p>
            <input
              id="fileInput"
              type="file"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
          <div className="flex gap-2 mb-3">
            <button className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-xs">
              [Share Link]
            </button>
            <button className="text-gray-400 hover:text-gray-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Available Files */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Available Files
          </h3>
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-gray-700 rounded px-3 py-1.5 text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="space-y-2">
            {availableFiles.map(file => (
              <div key={file.id} className="bg-gray-700/50 rounded p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div>
                    {file.priority && <span className="text-yellow-400 text-xs">⚡ [Priority] </span>}
                    <span className="text-xs">{file.name}</span>
                  </div>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs">
                  [Download]
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Performance
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-gray-400">Connections</span>
                <span className="text-xs">+ ○ □</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mb-1">
                <div
                  className="bg-green-500 h-1.5 rounded-full"
                  style={{ width: `${(stats.connections / stats.maxConnections) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500">({stats.connections}/{stats.maxConnections} Active)</p>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Avg. Queue Time: <span className="text-gray-200">{stats.avgQueueTime}s</span></p>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <p className="text-xs font-medium mb-2">Sposter Files</p>
              <p className="text-xs text-gray-400">Avg. Queue Time: <span className="text-gray-200">1s</span></p>
              <p className="text-xs text-gray-400 mt-1">Completed Today: <span className="text-green-400">✓ {stats.completedToday}</span></p>
              <p className="text-xs text-gray-400 mt-1">Failed: <span className="text-red-400">✗ {stats.failed}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Transfer Queues */}
      <div className="grid grid-cols-2 gap-4">
        {/* Transfer Queue 1 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            Transfer Queue
          </h3>
          <div className="space-y-2">
            {transferQueue1.map((file, index) => (
              <div key={file.id} className="bg-gray-700/50 rounded p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs">{file.name}</p>
                    <p className="text-xs text-gray-500">({file.size} MB)</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-gray-400 hover:text-gray-200">
                    <Upload className="w-3 h-3" />
                  </button>
                  <button className="text-gray-400 hover:text-gray-200">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transfer Queue 2 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Transfer Queue
          </h3>
          <div className="space-y-2">
            {transferQueue2.map((file, index) => (
              <div key={file.id} className="bg-gray-700/50 rounded p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs">{file.name}</p>
                  </div>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs">
                  [Download]
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <div className="w-2 h-2 bg-white rounded-full"></div>
        <span className="text-sm">File received from Alice</span>
        <button className="ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default P2PFileTransfer;