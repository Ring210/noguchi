import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import dayjs from "dayjs";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Bell, LogIn, LogOut, Search, Calendar, Clock, Users, Plus, Trash2, Upload, Settings } from "lucide-react";

// ====== Utility helpers ======
const STORAGE_KEYS = {
  tickets: "noguchi_tickets_v1",
  settings: "noguchi_settings_v1",
};

function randTicketId(existing = new Set()) {
  // Format: 5 uppercase letters + 3 digits, e.g., ABCDE123
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  let id = "";
  do {
    id = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join("") +
      Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join("");
  } while (existing.has(id));
  return id;
}

function loadJSON(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function downloadFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function makeICS({ title, start, end, location, description, uid }) {
  const dt = (d) => dayjs(d).utc().format("YYYYMMDD[T]HHmmss[Z]");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Noguchi Haunted House//JP//",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}@noguchi.local`,
    `DTSTAMP:${dt(new Date())}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : "",
    description ? `DESCRIPTION:${description}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

// ====== Defaults ======
const defaultSettings = {
  eventTitle: "お化け屋敷『野口君の呪い』 整理券",
  location: "文化祭 会場B棟 1F",
  slotMinutes: 10,
  slotCapacity: 8,
  reminderMinutesBefore: 5,
  adminPin: "noguchi",
  // Today's sample schedule (09:00-16:00)
  schedule: {
    date: dayjs().format("YYYY-MM-DD"),
    start: "09:00",
    end: "16:00",
  },
};

// ====== Data Shapes ======
// Ticket: { id, name, contact, slotId, slotStartISO, slotEndISO, createdAtISO, notified }
// Settings: see defaultSettings

function buildSlots(settings) {
  const { schedule, slotMinutes } = settings;
  const start = dayjs(`${schedule.date} ${schedule.start}`);
  const end = dayjs(`${schedule.date} ${schedule.end}`);
  const slots = [];
  let t = start;
  let idx = 0;
  while (t.isBefore(end)) {
    const s = t;
    const e = t.add(slotMinutes, "minute");
    slots.push({
      id: `${schedule.date}-${String(idx).padStart(3, "0")}`,
      label: `${s.format("HH:mm")}-${e.format("HH:mm")}`,
      startISO: s.toISOString(),
      endISO: e.toISOString(),
    });
    t = e;
    idx++;
  }
  return slots;
}

function usePersistentState(key, initial) {
  const [state, setState] = useState(() => loadJSON(key, initial));
  useEffect(() => saveJSON(key, state), [key, state]);
  return [state, setState];
}

function capacityForSlot(tickets, slotId) {
  return tickets.filter((t) => t.slotId === slotId).length;
}

function requestNotifyPermission() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

function scheduleReminder(ticket, settings) {
  const { reminderMinutesBefore } = settings;
  const fireAt = dayjs(ticket.slotStartISO).subtract(reminderMinutesBefore, "minute");
  const ms = fireAt.diff(dayjs(), "millisecond");
  if (ms <= 0) return; // too late to schedule
  // Page must remain open; this is a lightweight demo (no background push)
  window.setTimeout(() => {
    try {
      if (Notification.permission === "granted") {
        new Notification("入場時間のご案内", {
          body: `${ticket.name} 様の整理券 ${ticket.id} / 入場時刻 ${dayjs(ticket.slotStartISO).format("HH:mm")}`,
        });
      } else {
        alert(`入場時間のご案内: ${ticket.name} 様の整理券 ${ticket.id} / 入場時刻 ${dayjs(ticket.slotStartISO).format("HH:mm")}`);
      }
    } catch (e) {
      console.warn("Notification failed", e);
    }
  }, ms);
}

// ====== UI Components ======
const Section = ({ title, icon, children, right }) => (
  <div className="w-full">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {right}
    </div>
    <div className="bg-white/5 rounded-2xl p-4 shadow">
      {children}
    </div>
  </div>
);

function TicketCard({ ticket, settings, onDownloadICS }) {
  return (
    <motion.div layout className="rounded-2xl bg-white/10 p-4 shadow flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80">整理券番号</div>
          <div className="text-2xl font-mono tracking-widest">{ticket.id}</div>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-80">入場時間</div>
          <div className="text-lg font-semibold">{dayjs(ticket.slotStartISO).format("HH:mm")} — {dayjs(ticket.slotEndISO).format("HH:mm")}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="col-span-2">
          <div className="text-sm opacity-80">お名前</div>
          <div className="text-base">{ticket.name}</div>
          <div className="text-sm opacity-80 mt-2">会場</div>
          <div className="text-base">{settings.location}</div>
        </div>
        <div className="flex md:justify-end">
          <div className="bg-white p-2 rounded-xl">
            <QRCodeCanvas value={JSON.stringify(ticket)} size={120} includeMargin />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onDownloadICS(ticket)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30">
          <Calendar className="w-4 h-4" /> カレンダーに追加(ICS)
        </button>
        <button onClick={() => {
          requestNotifyPermission().then(() => scheduleReminder(ticket, settings));
          alert(`${settings.reminderMinutesBefore}分前にブラウザ通知を予約しました。このページを開いたままにしてください。`);
        }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30">
          <Bell className="w-4 h-4" /> 入場通知を予約
        </button>
      </div>
    </motion.div>
  );
}

function AdminPanel({ tickets, setTickets, settings, setSettings, slots }) {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return tickets;
    return tickets.filter((t) =>
      [t.id, t.name, t.contact, t.slotId, dayjs(t.slotStartISO).format("HH:mm")]
        .some((v) => String(v ?? "").toLowerCase().includes(k))
    );
  }, [tickets, q]);

  const countsBySlot = useMemo(() => {
    const m = new Map();
    slots.forEach((s) => m.set(s.id, 0));
    tickets.forEach((t) => m.set(t.slotId, (m.get(t.slotId) || 0) + 1));
    return m;
  }, [tickets, slots]);

  function removeTicket(id) {
    if (!confirm(`整理券 ${id} を削除します。よろしいですか？`)) return;
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }

  function exportCSV() {
    const csv = toCSV(tickets.map((t) => ({
      id: t.id,
      name: t.name,
      contact: t.contact,
      slot_label: `${dayjs(t.slotStartISO).format("HH:mm")}-${dayjs(t.slotEndISO).format("HH:mm")}`,
      slot_id: t.slotId,
      created_at: t.createdAtISO,
    })));
    downloadFile(`noguchi_tickets_${dayjs().format("YYYYMMDD_HHmmss")}.csv`, csv, "text/csv;charset=utf-8");
  }

  function importCSVText(text) {
    // Very basic CSV import (assumes header row has id,name,contact,slot_id,slot_label,created_at)
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const header = lines[0].split(",").map((s) => s.replace(/^\"|\"$/g, ""));
    const idx = (h) => header.indexOf(h);
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/\"([^\"]*(?:\"\"[^\"]*)*)\"|([^,]+)/g)?.map((s) => s.replace(/^\"|\"$/g, "").replace(/\"\"/g, '"')) || [];
      const slotId = cols[idx("slot_id")];
      const slot = slots.find((s) => s.id === slotId) || slots[0];
      out.push({
        id: cols[idx("id")] || randTicketId(new Set(tickets.map((t) => t.id))),
        name: cols[idx("name")] || "",
        contact: cols[idx("contact")] || "",
        slotId: slot.id,
        slotStartISO: slot.startISO,
        slotEndISO: slot.endISO,
        createdAtISO: cols[idx("created_at")] || new Date().toISOString(),
        notified: false,
      });
    }
    setTickets(out);
  }

  function updateSettings(partial) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function regenerateSchedule() {
    // NOP: slots are recomputed from settings in parent via useMemo
  }

  return (
    <Section title="受付・管理 (Admin)" icon={<Settings className="w-5 h-5" />} right={!authed ? (
      <div className="flex gap-2">
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN"
               className="px-3 py-2 rounded-xl bg-white/10" />
        <button className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 inline-flex items-center gap-2"
                onClick={() => setAuthed(pin === settings.adminPin)}>
          <LogIn className="w-4 h-4" /> ログイン
        </button>
      </div>
    ) : (
      <button className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 inline-flex items-center gap-2"
              onClick={() => setAuthed(false)}>
        <LogOut className="w-4 h-4" /> ログアウト
      </button>
    )}>
      {!authed ? (
        <div className="text-sm opacity-80">PIN を入力して管理画面に入ってください。（初期値: <code>{settings.adminPin}</code>）</div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="font-semibold mb-2">基本設定</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm opacity-80">タイトル
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.eventTitle}
                         onChange={(e)=>updateSettings({eventTitle:e.target.value})} />
                </label>
                <label className="text-sm opacity-80">会場
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.location}
                         onChange={(e)=>updateSettings({location:e.target.value})} />
                </label>
                <label className="text-sm opacity-80">1枠の分数
                  <input type="number" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.slotMinutes}
                         onChange={(e)=>updateSettings({slotMinutes:Math.max(5, Number(e.target.value)||10)})} />
                </label>
                <label className="text-sm opacity-80">枠の人数上限
                  <input type="number" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.slotCapacity}
                         onChange={(e)=>updateSettings({slotCapacity:Math.max(1, Number(e.target.value)||1)})} />
                </label>
                <label className="text-sm opacity-80">通知(何分前)
                  <input type="number" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.reminderMinutesBefore}
                         onChange={(e)=>updateSettings({reminderMinutesBefore:Math.max(1, Number(e.target.value)||5)})} />
                </label>
                <label className="text-sm opacity-80">管理PIN
                  <input className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.adminPin}
                         onChange={(e)=>updateSettings({adminPin:e.target.value})} />
                </label>
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="font-semibold mb-2">スケジュール</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-sm opacity-80">日付
                  <input type="date" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.schedule.date}
                         onChange={(e)=>updateSettings({schedule:{...settings.schedule, date:e.target.value}})} />
                </label>
                <label className="text-sm opacity-80">開始
                  <input type="time" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.schedule.start}
                         onChange={(e)=>updateSettings({schedule:{...settings.schedule, start:e.target.value}})} />
                </label>
                <label className="text-sm opacity-80">終了
                  <input type="time" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10"
                         value={settings.schedule.end}
                         onChange={(e)=>updateSettings({schedule:{...settings.schedule, end:e.target.value}})} />
                </label>
              </div>
              <div className="text-xs opacity-70 mt-2">設定変更は自動保存。下のプレビューで枠が更新されます。</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">枠ごとの予約状況</div>
              <div className="text-sm opacity-80">上限: {settings.slotCapacity} 名/枠</div>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {slots.map((s)=> (
                <div key={s.id} className="rounded-xl bg-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-mono">{s.label}</div>
                    <div className="inline-flex items-center gap-1 text-sm"><Users className="w-4 h-4" /> {countsBySlot.get(s.id) || 0}</div>
                  </div>
                  <div className="text-xs opacity-70">ID: {s.id.split("-").pop()}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">予約一覧</div>
              <div className="flex gap-2 items-center">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 opacity-70" />
                  <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="番号/名前/時間/枠IDを検索"
                         className="pl-8 pr-3 py-2 rounded-xl bg-white/10" />
                </div>
                <button className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 inline-flex items-center gap-2" onClick={exportCSV}>
                  <Download className="w-4 h-4" /> CSV書き出し
                </button>
                <label className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 inline-flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" /> CSV読み込み
                  <input type="file" accept=".csv" className="hidden" onChange={(e)=>{
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => importCSVText(String(reader.result||""));
                    reader.readAsText(f);
                  }} />
                </label>
              </div>
            </div>
            <div className="overflow-auto rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/10">
                    <th className="p-2 text-left">番号</th>
                    <th className="p-2 text-left">名前</th>
                    <th className="p-2 text-left">連絡(任意)</th>
                    <th className="p-2 text-left">時間</th>
                    <th className="p-2 text-left">枠ID</th>
                    <th className="p-2 text-left">登録</th>
                    <th className="p-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t)=> (
                    <tr key={t.id} className="odd:bg-white/5">
                      <td className="p-2 font-mono">{t.id}</td>
                      <td className="p-2">{t.name}</td>
                      <td className="p-2">{t.contact}</td>
                      <td className="p-2">{dayjs(t.slotStartISO).format("HH:mm")}-{dayjs(t.slotEndISO).format("HH:mm")}</td>
                      <td className="p-2">{t.slotId.split("-").pop()}</td>
                      <td className="p-2">{dayjs(t.createdAtISO).format("HH:mm:ss")}</td>
                      <td className="p-2">
                        <button className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 inline-flex items-center gap-1"
                                onClick={()=>removeTicket(t.id)}>
                          <Trash2 className="w-4 h-4"/>削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function App() {
  const [settings, setSettings] = usePersistentState(STORAGE_KEYS.settings, defaultSettings);
  const slots = useMemo(() => buildSlots(settings), [settings.schedule.date, settings.schedule.start, settings.schedule.end, settings.slotMinutes]);
  const [tickets, setTickets] = usePersistentState(STORAGE_KEYS.tickets, []);

  // Schedule background reminder timers for user's own tickets that exist in localStorage
  useEffect(() => {
    if (tickets.length) requestNotifyPermission();
  }, [tickets.length]);

  const existingIds = useMemo(() => new Set(tickets.map((t) => t.id)), [tickets]);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [slotId, setSlotId] = useState(slots[0]?.id || "");

  useEffect(() => {
    if (!slots.find((s) => s.id === slotId)) setSlotId(slots[0]?.id || "");
  }, [slots, slotId]);

  function createTicket() {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return alert("無効な枠が選択されています。");
    if (!name.trim()) return alert("名前を入力してください。");
    const count = capacityForSlot(tickets, slotId);
    if (count >= settings.slotCapacity) return alert("この枠は満員です。別の時間を選択してください。");

    const id = randTicketId(existingIds);
    const t = {
      id,
      name: name.trim(),
      contact: contact.trim(),
      slotId: slot.id,
      slotStartISO: slot.startISO,
      slotEndISO: slot.endISO,
      createdAtISO: new Date().toISOString(),
      notified: false,
    };
    setTickets((prev) => [...prev, t]);

    // Try to schedule a reminder immediately
    requestNotifyPermission().then(() => scheduleReminder(t, settings));

    setName("");
    setContact("");
    alert(`整理券を発行しました。番号: ${id}`);
  }

  function downloadICSFor(ticket) {
    const ics = makeICS({
      title: settings.eventTitle,
      start: ticket.slotStartISO,
      end: ticket.slotEndISO,
      location: settings.location,
      description: `整理券番号: ${ticket.id}`,
      uid: ticket.id,
    });
    downloadFile(`ticket_${ticket.id}.ics`, ics, "text/calendar;charset=utf-8");
  }

  const myTickets = useMemo(() => {
    // Very simple heuristic: show all tickets in localStorage (this device).
    // If you want per-user linking, add auth or contact-based lookup.
    return [...tickets].sort((a,b)=> dayjs(a.slotStartISO).valueOf() - dayjs(b.slotStartISO).valueOf());
  }, [tickets]);

  const now = dayjs();

  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto grid gap-6">
        <header className="flex items-center justify-between">
          <motion.h1 initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} transition={{duration:0.4}}
                     className="text-2xl md:text-3xl font-bold">
            👻 お化け屋敷 整理券アプリ <span className="opacity-80 text-base font-normal">— 野口君の呪い</span>
          </motion.h1>
          <div className="text-sm opacity-80">{dayjs().format("YYYY年MM月DD日 (ddd)")}</div>
        </header>

        {/* User Registration */}
        <Section title="整理券の発行" icon={<Plus className="w-5 h-5" />} right={<div className="text-sm opacity-80 flex items-center gap-2"><Clock className="w-4 h-4"/> 1枠 {settings.slotMinutes} 分 / 上限 {settings.slotCapacity} 名</div>}>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm opacity-80">お名前
                <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10" placeholder="例) 野口 太郎" />
              </label>
              <label className="text-sm opacity-80">連絡先 (任意 / メモ用)
                <input value={contact} onChange={(e)=>setContact(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10" placeholder="電話/クラスなど" />
              </label>
              <label className="text-sm opacity-80">入場時間の選択
                <select value={slotId} onChange={(e)=>setSlotId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10">
                  {slots.map((s)=>{
                    const count = capacityForSlot(tickets, s.id);
                    const full = count >= settings.slotCapacity;
                    const past = dayjs(s.endISO).isBefore(now);
                    return (
                      <option key={s.id} value={s.id} disabled={full || past}>
                        {s.label} {full ? "(満員)" : past ? "(終了)" : `(残り${settings.slotCapacity - count})`}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="flex gap-2">
                <button onClick={createTicket} className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 inline-flex items-center gap-2">
                  <Plus className="w-4 h-4"/> 整理券を発行
                </button>
                <button onClick={()=>requestNotifyPermission()} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 inline-flex items-center gap-2">
                  <Bell className="w-4 h-4"/> 通知許可をリクエスト
                </button>
              </div>
              <div className="text-xs opacity-70 leading-relaxed">
                ※ ブラウザ通知はこのページを開いたままのときに動作します。本格的なプッシュ配信が必要な場合はPWA/サーバ連携が必要です。<br />
                ※ 整理券・設定はこの端末のブラウザに保存されます（ローカル保存）。複数端末で共有する場合はCSVでエクスポート/インポートしてください。
              </div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="font-semibold mb-2">空き状況</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {slots.map((s) => {
                  const count = capacityForSlot(tickets, s.id);
                  const full = count >= settings.slotCapacity;
                  const past = dayjs(s.endISO).isBefore(now);
                  return (
                    <div key={s.id} className={`rounded-xl p-3 ${full||past?"bg-white/10 opacity-60":"bg-white/10"}`}>
                      <div className="font-mono">{s.label}</div>
                      <div className="text-sm opacity-80">{full?"満員":past?"終了":`残り ${settings.slotCapacity - count}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        {/* My Tickets */}
        <Section title="この端末で発行した整理券" icon={<Calendar className="w-5 h-5" />}>
          {myTickets.length === 0 ? (
            <div className="text-sm opacity-80">まだ整理券はありません。上で発行するとここに表示されます。</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {myTickets.map((t)=> (
                <TicketCard key={t.id} ticket={t} settings={settings} onDownloadICS={downloadICSFor} />
              ))}
            </div>
          )}
        </Section>

        {/* Admin */}
        <AdminPanel tickets={tickets} setTickets={setTickets} settings={settings} setSettings={setSettings} slots={slots} />

        <footer className="text-xs opacity-60 text-center py-6">
          © 2025 Noguchi Haunted House / Local-Only Demo. — データは端末内に保存されます。
        </footer>
      </div>
    </div>
  );
}
