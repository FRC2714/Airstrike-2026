import { NetworkTables, NetworkTablesTypeInfos } from 'ntcore-ts-client';

const CONFIG = {
  TEAM_NUMBER: 0,
  SERVER: '127.0.0.1',
};

let ntClient = null;
let targetXTopic = null;
let targetYTopic = null;
let allianceTopic = null;
let poseTopic = null;
let connectionCallback = null;

export async function initNetworkTables(teamNumber) {
  const team = teamNumber || CONFIG.TEAM_NUMBER;
  const server = team > 0 ? `10.${Math.floor(team / 100)}.${team % 100}.2` : CONFIG.SERVER;
  
  ntClient = NetworkTables.getInstanceByURI(server);
  
  ntClient.addRobotConnectionListener((connected) => {
    console.log(connected ? 'Connected to NetworkTables' : 'Disconnected from NetworkTables');
    if (connectionCallback) {
      connectionCallback(connected);
    }
  });
  
  targetXTopic = ntClient.createTopic('/SmartDashboard/airstryke/x', NetworkTablesTypeInfos.kDouble);
  targetYTopic = ntClient.createTopic('/SmartDashboard/airstryke/y', NetworkTablesTypeInfos.kDouble);
  allianceTopic = ntClient.createTopic('/FMSInfo/IsRedAlliance', NetworkTablesTypeInfos.kBoolean);
  
  await targetXTopic.publish({ defaultValue: 0 });
  await targetYTopic.publish({ defaultValue: 0 });
  
  console.log('NetworkTables initialized');
  return true;
}

export function onConnectionChange(callback) {
  connectionCallback = callback;
}

export function publishTarget(target) {
  if (!targetXTopic || !targetYTopic) {
    console.warn('Topics not ready');
    return;
  }
  
  targetXTopic.setValue(target.x);
  targetYTopic.setValue(target.y);
  console.log(`Published: X=${target.x}, Y=${target.y}`);
}

export function clearTarget() {
  if (!targetXTopic || !targetYTopic) return;
  
  targetXTopic.setValue(0);
  targetYTopic.setValue(0);
}

export function subscribeToAlliance(callback) {
  if (!allianceTopic) return null;
  
  const subId = allianceTopic.subscribe((value) => {
    console.log('Alliance value:', value);
    if (typeof value === 'boolean') {
      callback(value ? 'red' : 'blue');
    }
  });
  
  return subId;
}

export function subscribeToRobotPose(callback) {
  if (!ntClient) {
    console.warn('NetworkTables not initialized');
    return null;
  }
  
  // Subscribe to the struct topic as a double array
  // Pose2d struct is typically: [x, y, rotation] in meters/radians
  const topic = ntClient.createTopic('/Robot Pose', NetworkTablesTypeInfos.kDoubleArray);
  
  const subId = topic.subscribe((value) => {
    if (Array.isArray(value) && value.length >= 3) {
      // Convert meters to inches
      const METERS_TO_INCHES = 39.3701;
      callback({
        x: value[0] * METERS_TO_INCHES,
        y: value[1] * METERS_TO_INCHES,
        rotation: value[2], // radians
      });
    }
  });
  
  console.log('Subscribed to Robot Pose');
  return subId;
}

export function isConnected() {
  return ntClient !== null;
}

export { CONFIG as NT_CONFIG };