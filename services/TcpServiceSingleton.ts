import TcpService from "./TcpService";

let tcpServiceInstance: TcpService | null = null;

export function getTcpService(): TcpService {
  if (!tcpServiceInstance) {
    tcpServiceInstance = new TcpService();
  }
  return tcpServiceInstance;
}

export function resetTcpService(): void {
  if (tcpServiceInstance) {
    tcpServiceInstance.stop();
    tcpServiceInstance = null;
  }
}
