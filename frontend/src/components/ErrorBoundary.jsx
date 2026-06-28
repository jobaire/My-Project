import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', minHeight: 300,
          gap: 12, padding: 40,
          color: '#666',
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: '#999', textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8, padding: '8px 20px',
              border: '1px solid #d0d0d0', borderRadius: 6,
              background: '#fff', cursor: 'pointer',
              fontSize: 13, color: '#333',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
