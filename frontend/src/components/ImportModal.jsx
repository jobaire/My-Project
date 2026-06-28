import {
  CheckCircleOutlined,
  DownloadOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { useState } from 'react'

const { Dragger } = Upload
const { Text, Title } = Typography

// step: 'idle' | 'previewing' | 'done'

export default function ImportModal({ open, onClose, onDone, entityName, onPreview, onConfirm, onTemplate }) {
  const [step, setStep] = useState('idle')
  const [previewData, setPreviewData] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function reset() {
    setStep('idle')
    setPreviewData(null)
    setResult(null)
    setError(null)
    setLoading(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleUpload(file) {
    setLoading(true)
    setError(null)
    try {
      const data = await onPreview(file)
      setPreviewData(data)
      setStep('previewing')
    } catch (e) {
      setError(e.message || 'Failed to parse file')
    } finally {
      setLoading(false)
    }
    return false
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const rows = previewData.valid.map((v) => v.data)
      const res = await onConfirm(rows)
      setResult(res)
      setStep('done')
    } catch (e) {
      setError(e.message || 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  // Use 'preview' key if backend provided it (display-friendly names), else fall back to 'data'
  const displayKey = previewData?.valid?.[0]?.preview ? 'preview' : 'data'
  const previewColumns = previewData?.valid?.[0]
    ? Object.keys(previewData.valid[0][displayKey]).map((k) => ({
        title: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        dataIndex: [displayKey, k],
        key: k,
        ellipsis: true,
        render: (v) => (v != null && v !== '—' ? v : <Text type="secondary">—</Text>),
      }))
    : []

  const footer =
    step === 'idle'
      ? [<Button key="cancel" onClick={handleClose}>Cancel</Button>]
      : step === 'previewing'
      ? [
          <Button key="back" onClick={reset} disabled={loading}>Back</Button>,
          <Button
            key="confirm"
            type="primary"
            loading={loading}
            disabled={!previewData?.valid?.length}
            onClick={handleConfirm}
          >
            Import {previewData?.valid?.length ?? 0} row{previewData?.valid?.length !== 1 ? 's' : ''}
          </Button>,
        ]
      : [<Button key="close" type="primary" onClick={() => { onDone(); handleClose() }}>Done</Button>]

  return (
    <Modal
      title={`Import ${entityName}`}
      open={open}
      onCancel={handleClose}
      footer={footer}
      width={700}
      destroyOnHidden
    >
      {step === 'idle' && (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary">
              Download the template, fill it in Excel, then upload it here.
            </Text>
            <br />
            <Button
              icon={<DownloadOutlined />}
              size="small"
              style={{ marginTop: 8 }}
              onClick={onTemplate}
            >
              Download Template
            </Button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Spin />
              <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>Parsing file…</div>
            </div>
          ) : (
            <Dragger accept=".csv" multiple={false} beforeUpload={handleUpload} showUploadList={false}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Click or drag CSV file here to upload</p>
              <p className="ant-upload-hint">Only .csv files are supported</p>
            </Dragger>
          )}
          {error && <Alert type="error" title={error} showIcon />}
        </Space>
      )}

      {step === 'previewing' && previewData && (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <Tag color="green" icon={<CheckCircleOutlined />}>
              {previewData.valid.length} valid row{previewData.valid.length !== 1 ? 's' : ''}
            </Tag>
            {previewData.errors.length > 0 && (
              <Tag color="red" icon={<WarningOutlined />}>
                {previewData.errors.length} row{previewData.errors.length !== 1 ? 's' : ''} with errors
              </Tag>
            )}
          </Space>

          {previewData.errors.length > 0 && (
            <Alert
              type="warning"
              title="Rows with errors will be skipped"
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {previewData.errors.map((e) => (
                    <li key={e.row} style={{ fontSize: 12 }}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              }
              showIcon
            />
          )}

          {previewData.valid.length > 0 ? (
            <Table
              size="small"
              columns={previewColumns}
              dataSource={previewData.valid.map((v, i) => ({ ...v, key: i }))}
              pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
            />
          ) : (
            <Alert type="error" title="No valid rows found — check your file and try again" showIcon />
          )}

          {error && <Alert type="error" title={error} showIcon />}
        </Space>
      )}

      {step === 'done' && result && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
          <Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>Import Complete</Title>
          <Text type="secondary">
            {result.imported} {entityName.toLowerCase()} imported successfully.
          </Text>
        </div>
      )}
    </Modal>
  )
}
