import { useCallback, useRef, useState } from 'react';
import type { ProcessingStatus } from '../types';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  status: ProcessingStatus;
}

const ACCEPTED_TYPES = [
  '.csv',
  '.xlsx',
  '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

export default function FileUpload({ onFileSelected, status }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const isProcessing = status !== 'idle' && status !== 'complete' && status !== 'error';

  return (
    <div className="file-upload-section">
      <div
        className={`drop-zone ${dragActive ? 'drag-active' : ''} ${isProcessing ? 'processing' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleChange}
          disabled={isProcessing}
          style={{ display: 'none' }}
        />

        {isProcessing ? (
          <div className="upload-status">
            <div className="spinner" />
            <p className="status-text">
              {status === 'parsing' && 'Reading & parsing data...'}
              {status === 'analyzing' && 'Analyzing consumption...'}
            </p>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">📁</div>
            <p className="upload-title">
              {fileName ? fileName : 'Drop Power Platform export file here'}
            </p>
            <p className="upload-subtitle">
              or click to browse — supports .csv, .xlsx, .xls (up to 100MB)
            </p>
          </div>
        )}
      </div>

      <div className="upload-info-panel">
        <h2 className="upload-info-heading">📊 Power Platform Request Consumption Analyzer</h2>
        <p className="upload-info-text">
          Analyze your Power Platform request consumption data. Upload a CSV file exported from the <strong>Power Platform Admin Center (PPAC)</strong>.
        </p>

        <p className="upload-info-label">Supported <strong>report types</strong>:</p>
        <table className="upload-info-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Report Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><strong>Licensed User</strong></td>
              <td>Shows per-user PPR consumption for licensed users (Power Apps, Power Automate, D365, etc.)</td>
            </tr>
            <tr>
              <td>2</td>
              <td><strong>Non-Licensed User</strong></td>
              <td>Shows consumption by non-interactive, application, and system users against the tenant-level pool</td>
            </tr>
            <tr>
              <td>3</td>
              <td><strong>Per Flow Licensed Flows</strong></td>
              <td>Shows consumption by flows with per-flow or process licenses</td>
            </tr>
          </tbody>
        </table>

        <div className="upload-info-download">
          <span className="upload-info-download-icon">📥</span>
          <div>
            <strong>How to download your report:</strong>
            <p className="upload-info-text">
              Go to <a href="https://admin.powerplatform.microsoft.com/" target="_blank" rel="noopener noreferrer" className="upload-info-link">PPAC</a> &gt; <strong>Licensing</strong> &gt; <strong>Capacity add-ons</strong> &gt; <strong>Download reports</strong> &gt; <strong>Microsoft Power Platform requests</strong> and select the desired report type.
            </p>
            <p className="upload-info-text" style={{ marginTop: 6 }}>
              📖 <a href="https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations" target="_blank" rel="noopener noreferrer" className="upload-info-link">Microsoft docs: Requests limits and allocations</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
