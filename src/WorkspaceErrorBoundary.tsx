import { Component, type ReactNode } from 'react';
export default class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>เปิดหน้าจอนี้ไม่สำเร็จ</h1>
        <p role="alert">
          การโหลดอาจขาดช่วง ข้อมูลที่บันทึกและคิวในเครื่องยังถูกเก็บไว้
          กรุณาลองใหม่เมื่อการเชื่อมต่อพร้อม
        </p>
        <button
          onClick={() => (this.props.onRetry ? this.props.onRetry() : window.location.reload())}
        >
          โหลดแอปใหม่โดยเก็บข้อมูลเดิม
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
