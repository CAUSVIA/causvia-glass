// Reads `xcrun simctl list devices available -j` on stdin and prints the UDID of the newest plain iPhone.
const devices = JSON.parse(require('fs').readFileSync(0, 'utf8')).devices;
const phones = Object.entries(devices)
  .filter(([runtime]) => runtime.includes('iOS'))
  .flatMap(([, list]) => list)
  .filter((d) => /^iPhone \d+$/.test(d.name));
const pick = phones.at(-1);
console.error(`simulator: ${pick.name}`);
console.log(pick.udid);
