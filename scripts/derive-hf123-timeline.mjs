const stamps = {
  sessionStartedAt: 1786597820213,
  tripStateChangedAt: 1786598012036,
  serviceStartedAt: 1786597956004,
  observerTaskRemovedAt: 1786597932987,
  lastGtoBackgroundEventAt: 1786597959682,
  lastGtoForegroundEventAt: 1786597959837,
  beforeOverlayAttemptAt: 1786599445244,
  beforeHeartbeatAt: 1786599545513,
  afterHeartbeatAt: 1786599591753,
  beforeTouchPulseAt: 1786599533824,
  afterTouchPulseAt: 1786599586116,
};
for (const [name, value] of Object.entries(stamps)) {
  console.log(`${name}=${new Date(value).toISOString()}`);
}
console.log(`tripStateChanged-sessionStarted-ms=${stamps.tripStateChangedAt - stamps.sessionStartedAt}`);
console.log(`serviceStarted-sessionStarted-ms=${stamps.serviceStartedAt - stamps.sessionStartedAt}`);
console.log(`afterTouch-beforeHeartbeat-ms=${stamps.afterTouchPulseAt - stamps.beforeHeartbeatAt}`);
console.log(`beforeTouch-beforeHeartbeat-ms=${stamps.beforeTouchPulseAt - stamps.beforeHeartbeatAt}`);
