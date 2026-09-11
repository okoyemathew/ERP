type DashboardRefreshListener = () => void;

const listeners = new Set<DashboardRefreshListener>();

export const dashboardEvents = {
  subscribe(listener: DashboardRefreshListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  notifyActivityChanged() {
    listeners.forEach((listener) => listener());
  },
  notifySaleChanged() {
    this.notifyActivityChanged();
  }
};
