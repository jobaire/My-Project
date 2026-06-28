import { Typography, Modal, Tabs } from 'antd'
import { useMemo, useState } from 'react'
import CommonSetupTab  from './CommonSetupTab'
import CalendarTab     from './CalendarTab'
import PlanSegmentTab  from './PlanSegmentTab'
import LinesSetupTab   from './LinesSetupTab'
import LearningCurvesTab from './LearningCurvesTab'
import SetupPlaceholder  from './SetupPlaceholder'

const { Text } = Typography

export default function PlanningSetupModal({ open, token, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('common')

  const tabs = useMemo(() => [
    { key: 'common',    label: 'Common Setup',     children: <CommonSetupTab    token={token} active={open && activeTab === 'common'}   onSaved={onSaved} /> },
    { key: 'calendar',  label: 'Calendar',          children: <CalendarTab       token={token} active={open && activeTab === 'calendar'} /> },
    { key: 'segment',   label: 'Plan Segment',      children: <PlanSegmentTab    token={token} active={open && activeTab === 'segment'}  /> },
    { key: 'lines',     label: 'Plan Mc / Lines',   children: <LinesSetupTab     token={token} active={open && activeTab === 'lines'}    onSaved={onSaved} /> },
    { key: 'customer',  label: 'Customer Profile',  children: <SetupPlaceholder  title="Customer Profile" description="Define customer-specific priorities, lead time requirements, and planning preferences." /> },
    { key: 'lc',        label: 'Learning Curves',   children: <LearningCurvesTab token={token} active={open && activeTab === 'lc'}      /> },
    { key: 'skill',     label: 'Line Skill Matrix', children: <SetupPlaceholder  title="Line Skill Matrix" description="Map which production lines are capable of running which styles, categories, or processes." /> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [token, open, activeTab, onSaved])

  return (
    <Modal
      title={<Text strong style={{ fontSize: 15 }}>Planning Setup</Text>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={940}
      destroyOnHidden={false}
      styles={{ body: { padding: 0, minHeight: 460 } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabs}
        tabPlacement="left"
        style={{ minHeight: 460 }}
        tabBarStyle={{ width: 150, paddingTop: 8, background: '#f8fafc', borderRight: '1px solid #e8eef2' }}
      />
    </Modal>
  )
}
