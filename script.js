const slots = [
  "09:00","09:10","09:20","09:30","09:40",
  "10:00","10:10","10:20","10:30","10:40",
  "11:00","11:10","11:20","11:30","11:40",
  "13:00","13:10","13:20","13:30","13:40",
  "14:00","14:10","14:20","14:30","14:40",
  "15:00","15:10","15:20","15:30","15:40"
];

const timeSlotSelect = document.getElementById("timeSlot");
slots.forEach(s => {
  const option = document.createElement("option");
  option.value = s;
  option.textContent = s;
  timeSlotSelect.appendChild(option);
});

function generateTicketId() {
  const letters = Array.from({length:5}, () => String.fromCharCode(65 + Math.floor(Math.random()*26))).join("");
  const numbers = String(Math.floor(Math.random()*1000)).padStart(3,"0");
  return letters + numbers;
}

const tickets = [];

document.getElementById("ticketForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("username").value.trim();
  if (!name) { alert("名前を入力してください"); return; }
  const time = document.getElementById("timeSlot").value;
  const id = generateTicketId();
  const ticket = {name, time, id};
  tickets.push(ticket);
  displayTicket(ticket);
  notifyTicket(ticket);
});

function displayTicket(ticket) {
  const div = document.getElementById("ticketDisplay");
  div.innerHTML = `<h2>整理券</h2>
    <p>名前: ${ticket.name}</p>
    <p>時間: ${ticket.time}</p>
    <p>ID: <b>${ticket.id}</b></p>`;
}

// ブラウザ通知
function notifyTicket(ticket) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("整理券発行完了", {body: `${ticket.time} 入場 ID: ${ticket.id}`});
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("整理券発行完了", {body: `${ticket.time} 入場 ID: ${ticket.id}`});
      }
    });
  }
}

// CSVエクスポート
function downloadCSV() {
  let csv = "名前,時間,ID\n";
  tickets.forEach(t => { csv += `${t.name},${t.time},${t.id}\n`; });
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tickets.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// CSVインポート
function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split(/\r?\n/);
    lines.slice(1).forEach(line => {
      if (!line) return;
      const [name,time,id] = line.split(",");
      tickets.push({name,time,id});
    });
    alert("CSVを読み込みました");
  };
  reader.readAsText(file);
}
