import { HolderOutlined } from '@ant-design/icons'
import { Button, Modal, Table, Tag, Typography } from 'antd'
import { useDraggable } from '@dnd-kit/core'

const { Text: T } = Typography

const STATUS_COLOR = {
  Confirmed:          '#16a34a',
  Forecast:           '#2563eb',
  Projection:         '#0891b2',
  'Under Projection': '#d97706',
}

function PendingDragHandle({ line }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pending_${line.id}`,
    data: { type: 'pending_line', line },
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', color: isDragging ? '#b0bec5' : '#aab8c2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, userSelect: 'none', width: '100%', height: '100%' }}
    >
      <HolderOutlined />
    </div>
  )
}

export default function PendingOrdersModal({ open, orders, onClose, draggingFromPending }) {
  const headerStyle = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#6a8a98', background: '#f8fafc', padding: '6px 8px' }
  const cellStyle = { padding: '3px 8px' }
  const fs = 12

  const columns = [
    {
      title: '', key: 'drag', width: 28,
      onHeaderCell: () => ({ style: { ...headerStyle, padding: '6px 4px' } }),
      onCell: () => ({ style: { ...cellStyle, padding: '3px 4px' } }),
      render: (_, r) => <PendingDragHandle line={r} />,
    },
    {
      title: 'Order', key: 'order',
      onHeaderCell: () => ({ style: headerStyle }),
      onCell: () => ({ style: cellStyle }),
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <T strong style={{ fontSize: fs }}>{r.order_name}</T>
          {r.customer_name && <T style={{ fontSize: 11, color: '#aaa', display: 'block' }}>{r.customer_name}</T>}
        </div>
      ),
    },
    { title: 'Line', dataIndex: 'line_number', onHeaderCell: () => ({ style: headerStyle }), onCell: () => ({ style: cellStyle }), render: v => <T style={{ fontSize: fs }}>{v ?? '—'}</T> },
    { title: 'Color', dataIndex: 'color_name', onHeaderCell: () => ({ style: headerStyle }), onCell: () => ({ style: cellStyle }), render: v => <T style={{ fontSize: fs }}>{v || '—'}</T> },
    {
      title: 'Qty', key: 'qty',
      onHeaderCell: () => ({ style: headerStyle }),
      onCell: () => ({ style: cellStyle }),
      render: (_, r) => (
        <span>
          {r.is_partial && <Tag color="orange" style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', marginRight: 4 }}>Partial</Tag>}
          <T style={{ fontSize: fs }}>{(r.remaining_qty ?? r.delivery_qty).toLocaleString()}</T>
        </span>
      ),
    },
    { title: 'Delivery', dataIndex: 'delivery_date', onHeaderCell: () => ({ style: headerStyle }), onCell: () => ({ style: cellStyle }), render: v => <T style={{ fontSize: fs }}>{v ? v.slice(0, 10) : '—'}</T> },
    {
      title: 'SMV', dataIndex: 'calculated_smv',
      onHeaderCell: () => ({ style: headerStyle }),
      onCell: () => ({ style: cellStyle }),
      render: v => v
        ? <T style={{ fontSize: fs }}>{Number(v).toFixed(2)} min</T>
        : <T style={{ color: '#f59e0b', fontSize: 11 }}>No SMV</T>,
    },
    {
      title: 'Status', dataIndex: 'status',
      onHeaderCell: () => ({ style: headerStyle }),
      onCell: () => ({ style: cellStyle }),
      render: v => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ borderRadius: 10, fontSize: 11, lineHeight: '16px' }}>{v}</Tag>,
    },
  ]

  const modalStyles = {
    body: { padding: 0 },
    ...(draggingFromPending ? {
      mask: { opacity: 0, pointerEvents: 'none' },
      wrapper: { pointerEvents: 'none' },
      content: { opacity: 0.05, pointerEvents: 'none' },
    } : {}),
  }

  return (
    <Modal
      title={`Pending Order Lines (${orders.length})`}
      open={open}
      onCancel={onClose}
      width="70vw"
      styles={modalStyles}
      footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button onClick={onClose}>Close</Button></div>}
    >
      <div style={{ padding: '6px 16px', background: '#f0f6f9', borderBottom: '1px solid #dde8ee' }}>
        <T style={{ fontSize: 11, color: '#8aa0ad' }}>Drag a row onto the planning board to schedule it</T>
      </div>
      <Table
        columns={columns}
        dataSource={orders}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 14, size: 'small', hideOnSinglePage: true }}
        locale={{ emptyText: 'All order lines are scheduled' }}
        scroll={{ y: 'calc(75vh - 220px)' }}
      />
    </Modal>
  )
}
