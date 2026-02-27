import { NetworkTables, NetworkTablesTypeInfos } from 'ntcore-ts-client';

const CONFIG = {
  TEAM_NUMBER: 2714,
  SERVER: '127.0.0.1',
};

let ntClient = null;
let targetXTopic = null;
let targetYTopic = null;
let allianceTopic = null;
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

  targetXTopic = ntClient.createTopic('/SmartDashboard/airstrike/x', NetworkTablesTypeInfos.kDouble);
  targetYTopic = ntClient.createTopic('/SmartDashboard/airstrike/y', NetworkTablesTypeInfos.kDouble);
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

  // WPILib Field2d default object path is SmartDashboard/<name>/Robot.
  // Keep fallback topics so this still works with alternate publishers.
  const poseTopics = [
    ntClient.createTopic('/SmartDashboard/Field/Robot', NetworkTablesTypeInfos.kDoubleArray),
    ntClient.createTopic('/SmartDashboard/Field/robotPose', NetworkTablesTypeInfos.kDoubleArray),
    ntClient.createTopic('/Robot Pose', NetworkTablesTypeInfos.kDoubleArray),
  ];

  const subIds = poseTopics.map((topic) => topic.subscribe((value) => {
    const parsed = parsePoseArray(value);
    if (parsed) {
      callback(parsed);
    }
  }));

  console.log('Subscribed to robot pose topics: /SmartDashboard/Field/Robot, /SmartDashboard/Field/robotPose, /Robot Pose');
  return subIds;
}

export function isConnected() {
  return ntClient !== null;
}

export { CONFIG as NT_CONFIG };
