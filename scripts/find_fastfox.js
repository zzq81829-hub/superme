import { exec } from "child_process";

exec('powershell -NoProfile -Command "Get-NetTCPConnection | Where-Object { $_.OwningProcess -in (34648, 31024, 24372) } | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize"', (err, stdout) => {
  if (err) console.error("Err:", err.message);
  console.log(stdout);
});
