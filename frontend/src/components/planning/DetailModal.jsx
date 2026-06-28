import { Typography, Modal, Spin, Table } from 'antd'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../utils/planningUtils'

const { Text } = Typography

const STATUS_COLOR = {
  Confirmed:          '#16a34a',
  Forecast:           '#2563eb',
  Projection:         '#0891b2',
  'Under Projection': '#d97706',
}

function DrawerSectionTitle({ children }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{children}</span>
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  )
}

function FieldCard({ label, value, span2, accent }) {
  return (
    <div style={{ gridColumn: span2 ? 'span 2' : undefined, background: '#f8fafc', borderRadius: 6, padding: '6px 10px', borderLeft: `2px solid ${accent || '#e2e8f0'}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>{value || '—'}</div>
    </div>
  )
}

function FieldGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>{children}</div>
}

function OrderDetailContent({ order, lines, sched }) {
  if (!order) return null
  const color  = STATUS_COLOR[order.status] ?? '#555'
  const durMs  = sched.planned_start && sched.planned_end ? new Date(sched.planned_end) - new Date(sched.planned_start) : null
  const durStr = durMs != null ? (durMs / 3600000 >= 24 ? `${(durMs / 86400000).toFixed(1)} days` : `${(durMs / 3600000).toFixed(1)} hrs`) : '—'
  const fmt    = dt => dt ? String(dt).slice(0, 16).replace('T', ' ') : '—'

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ padding: '2px 9px', borderRadius: 10, fontSize: 'var(--fs-2xs)', fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0 }}>{order.status}</div>
        <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{order.name}</Text>
      </div>
      {order.description && <Text style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-secondary)', display: 'block', marginBottom: 8 }}>{order.description}</Text>}

      <DrawerSectionTitle>Order Info</DrawerSectionTitle>
      <FieldGrid>
        <FieldCard label="Customer"    value={order.customer_name} />
        <FieldCard label="Customer PO" value={order.customer_po} />
        <FieldCard label="Style"       value={order.product_name} />
        <FieldCard label="Version"     value={order.version_name} />
        {order.brand_name  && <FieldCard label="Brand"  value={order.brand_name} />}
        {order.season_name && <FieldCard label="Season" value={order.season_name} />}
        {order.category_name && (
          <FieldCard label="Category" span2
            value={order.sub_category_name ? `${order.category_name} / ${order.sub_category_name}` : order.category_name} />
        )}
      </FieldGrid>

      <DrawerSectionTitle>Schedule</DrawerSectionTitle>
      <FieldGrid>
        <FieldCard label="Line"       value={sched.line_name} accent="#b0ddd9" />
        <FieldCard label="Qty"        value={sched.planned_qty ? `${Number(sched.planned_qty).toLocaleString()} pcs` : '—'} accent="#b0ddd9" />
        <FieldCard label="Start"      value={fmt(sched.planned_start)} />
        <FieldCard label="End"        value={fmt(sched.planned_end)} />
        <FieldCard label="Duration"   value={durStr} />
        <FieldCard label="Daily Cap"  value={sched.daily_capacity ? `${Math.round(sched.daily_capacity)} pcs/day` : '—'} />
        <FieldCard label="SMV"        value={sched.smv ? `${Number(sched.smv).toFixed(2)} min` : '—'} span2 accent="#b0ddd9" />
      </FieldGrid>

      {lines.length > 0 && (
        <>
          <DrawerSectionTitle>Order Lines ({lines.length})</DrawerSectionTitle>
          <Table
            dataSource={lines} rowKey="id" size="small" pagination={false}
            style={{ fontSize: 'var(--fs-xs)' }}
            columns={[
              { title: 'Color',    dataIndex: 'color_name',    ellipsis: true },
              { title: 'Delivery', dataIndex: 'delivery_date', width: 84, render: v => v?.slice(0, 10) ?? '—' },
              { title: 'Qty',      dataIndex: 'delivery_qty',  width: 66, align: 'right', render: v => v ? Number(v).toLocaleString() : '—' },
              { title: 'Price',    width: 80, align: 'right',  render: (_, r) => r.selling_price ? `${r.currency ?? ''} ${r.selling_price}` : '—' },
            ]}
          />
        </>
      )}
    </div>
  )
}

function StyleDetailContent({ order, steps, sched }) {
  if (!order) return null
  const sewingStep = steps.find(s => s.process_name?.toLowerCase().includes('sew'))

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14, color: '#0f172a', display: 'block' }}>{order.product_name}</Text>
        <Text style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-teal)', fontWeight: 600 }}>{order.version_name}</Text>
      </div>

      <DrawerSectionTitle>Style Info</DrawerSectionTitle>
      <FieldGrid>
        <FieldCard label="Customer" value={order.customer_name} />
        <FieldCard label="Brand"    value={order.brand_name} />
        <FieldCard label="Category" value={order.category_name} />
        {order.sub_category_name && <FieldCard label="Sub-Category" value={order.sub_category_name} />}
        {order.season_name && <FieldCard label="Season" value={order.season_name} span2={!order.sub_category_name} />}
      </FieldGrid>

      {sewingStep && (
        <>
          <DrawerSectionTitle>Planning SMV</DrawerSectionTitle>
          <div style={{ background: '#f0fbfa', border: '1px solid #b0ddd9', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 }}>Planned Sewing Operation</div>
              <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: '#0f172a' }}>{sewingStep.process_name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2 }}>Work Content</div>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-teal)', lineHeight: 1 }}>{Number(sewingStep.work_content).toFixed(2)}</span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-secondary)', marginLeft: 3 }}>min</span>
            </div>
          </div>
        </>
      )}

      {steps.length > 0 && (
        <>
          <DrawerSectionTitle>Routing Operations ({steps.length})</DrawerSectionTitle>
          <Table
            dataSource={steps} rowKey="id" size="small" pagination={false}
            style={{ fontSize: 'var(--fs-xs)' }}
            columns={[
              { title: 'Seq',     dataIndex: 'sequence',            width: 44, align: 'center' },
              { title: 'Process', dataIndex: 'process_name',        ellipsis: true,
                render: (v, r) => r.process_name?.toLowerCase().includes('sew')
                  ? <Text strong style={{ color: 'var(--c-teal)', fontSize: 'var(--fs-xs)' }}>{v}</Text> : <span style={{ fontSize: 'var(--fs-xs)' }}>{v}</span> },
              { title: 'Value',   dataIndex: 'work_content',        width: 60, align: 'right', render: v => v ? Number(v).toFixed(2) : '—' },
              { title: 'UOM',     dataIndex: 'unit_of_measurement', width: 54 },
            ]}
          />
        </>
      )}
    </div>
  )
}

export default function DetailModal({ type, sched, token, onClose }) {
  const [orderData,  setOrderData]  = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [steps,      setSteps]      = useState([])
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!sched || !type) return
    setOrderData(null); setOrderLines([]); setSteps([]); setLoading(true)

    apiFetch(`/orders/${sched.order_id}`, token)
      .then(ord => {
        setOrderData(ord)
        const extra = []
        if (type === 'order') extra.push(apiFetch(`/orders/${sched.order_id}/lines`, token).catch(() => []))
        if (type === 'style' && ord.version_id && sched.product_id)
          extra.push(apiFetch(`/products/${sched.product_id}/versions/${ord.version_id}/steps`, token).catch(() => []))
        return Promise.all(extra)
      })
      .then(([extra]) => {
        if (type === 'order') setOrderLines(extra || [])
        if (type === 'style') setSteps(extra || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [type, sched?.order_id])

  const titles = { order: 'Order Details', style: 'Style Details' }

  return (
    <Modal
      title={<Text strong style={{ fontSize: 14 }}>{titles[type] ?? 'Details'}</Text>}
      open={!!sched}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
      styles={{ body: { padding: '10px 14px', overflowY: 'auto', maxHeight: '70vh' } }}
    >
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Spin size="large" /></div>
        : type === 'order'
          ? <OrderDetailContent order={orderData} lines={orderLines} sched={sched} />
          : <StyleDetailContent order={orderData} steps={steps} sched={sched} />
      }
    </Modal>
  )
}
