/**
 * Desktop Agent Bluetooth Module
 * Advertises BLE service and handles pairing code exchange
 * Note: Requires noble, bleno, or node-ble on Windows/Linux
 */

const BT_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';

export class BluetoothModule {
  constructor() {
    this.isAdvertising = false;
    this.pairingCallback = null;
    this.adapter = null;
  }

  async startAdvertising(onPairingCodeReceived) {
    this.pairingCallback = onPairingCodeReceived;
    this.isAdvertising = true;

    // In a real Node.js environment, we would use 'bleno' or 'node-ble'
    // For now, we simulate the advertising state for the UI
    console.log('[BT Agent] Advertising started as "PocketAI-Office"');
    console.log('[BT Agent] Service UUID:', BT_SERVICE_UUID);
    
    return true;
  }

  stopAdvertising() {
    this.isAdvertising = false;
    console.log('[BT Agent] Advertising stopped');
  }

  handlePairingCode(code) {
    console.log('[BT Agent] Received pairing code via BLE:', code);
    if (this.pairingCallback) {
      this.pairingCallback(code);
    }
  }
}

export default BluetoothModule;
