import { NetworkTables, NetworkTablesTypeInfos } from 'ntcore-ts-client';

const CONFIG = {
  TEAM_NUMBER: 2714,
  SIM_SERVER: '127.0.0.1',
  ROBOT_TIMEOUT_MS: 500,
};

let ntClient = null;
let targetXTopic = null;
let targetYTopic = null;
let allianceTopic = null;
let connectionCallback = null;
let activeServer = '';

export async function initNetworkTables() {
  const team = CONFIG.TEAM_NUMBER;
  const robotIP = `10.${Math.floor(team / 100)}.${team % 100}.2`;
  const simIP = CONFIG.SIM_SERVER;

  // Try connecting to the robot first. If it responds within the timeout,
  // use the robot. Otherwise fall back to localhost (simulation).
  // When both are available the robot always wins.
  const robotClient = NetworkTables.getInstanceByURI(robotIP);

  const robotConnected = await new Promise((resolve) => {
    let settled = false;
    robotClient.addRobotConnectionListener((connected) => {
      if (!settled && connected) {
        settled = true;
        resolve(true);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, CONFIG.ROBOT_TIMEOUT_MS);
  });

  if (robotConnected) {
    console.log(`Connected to robot at ${robotIP}`);
    ntClient = robotClient;
    activeServer = robotIP;
  } else {
    console.log(`Robot not found at ${robotIP}, falling back to simulation at ${simIP}`);
    ntClient = NetworkTables.getInstanceByURI(simIP);
    activeServer = simIP;
  }

  targetXTopic = ntClient.createTopic('/SmartDashboard/airstrike/x', NetworkTablesTypeInfos.kDouble);
  targetYTopic = ntClient.createTopic('/SmartDashboard/airstrike/y', NetworkTablesTypeInfos.kDouble);
  allianceTopic = ntClient.createTopic('/FMSInfo/IsRedAlliance', NetworkTablesTypeInfos.kBoolean);

  await targetXTopic.publish({ defaultValue: 0 });
  await targetYTopic.publish({ defaultValue: 0 });

  // Register connection listener AFTER topics are published so
  // callbacks that fire on connect can safely call setValue.
  ntClient.addRobotConnectionListener((connected) => {
    console.log(connected ? `Connected to NetworkTables at ${activeServer}` : 'Disconnected from NetworkTables');
    if (connected) {
      // Re-publish topics on reconnect so setValue works
      targetXTopic.publish({ defaultValue: 0 });
      targetYTopic.publish({ defaultValue: 0 });
    }
    if (connectionCallback) {
      connectionCallback(connected);
    }
  });

  console.log(`NetworkTables initialized (${robotConnected ? 'robot' : 'simulation'} mode)`);
  return robotConnected;
}

export function getActiveServer() {
  return activeServer;
}

export function onConnectionChange(callback) {
  connectionCallback = callback;
}

export function publishTarget(target) {
  if (!targetXTopic || !targetYTopic) {
    console.warn('Topics not ready');
    return;
  }

  try {
    targetXTopic.setValue(target.x);
    targetYTopic.setValue(target.y);
  } catch (e) {
    console.warn('publishTarget failed (topic not yet published):', e.message);
  }
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

function parsePoseArray(value) {
  if (!Array.isArray(value) || value.length < 3) return null;

  const METERS_TO_INCHES = 39.3701;
  const xInches = value[0] * METERS_TO_INCHES;
  const yInches = value[1] * METERS_TO_INCHES;

  // Field2d robot pose uses degrees in NT (x meters, y meters, theta degrees).
  const thetaDegrees = value[2];
  const thetaRadians = (thetaDegrees * Math.PI) / 180;

  return {
    x: xInches,
    y: yInches,
    rotation: thetaRadians,
  };
}

export function subscribeToRobotPose(callback) {
  if (!ntClient) {
    console.warn('NetworkTables not initialized');
    return null;
  }

  const poseTopic = ntClient.createTopic('Robot Pose Array', NetworkTablesTypeInfos.kDoubleArray);

  const subId = poseTopic.subscribe((value) => {
    console.log('Robot Pose raw:', value);
    const parsed = parsePoseArray(value);
    if (parsed) {
      callback(parsed);
    }
  });

  console.log('Subscribed to Robot Pose Array');
  return subId;
}

export function isConnected() {
  return ntClient !== null;
}

export { CONFIG as NT_CONFIG };
