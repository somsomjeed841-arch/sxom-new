import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// ปิด bodyParser เพื่อให้ formidable จัดการไฟล์ภาพได้
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = formidable({});

  try {
    // 1. อ่านข้อมูลจากหน้าบ้าน (UID และ ไฟล์ภาพ)
    const [fields, files] = await form.parse(req);
    const uid = fields.uid?.[0]; 
    const slipFile = files.files?.[0]; 

    if (!uid || !slipFile) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน (ขาด UID หรือไฟล์สลิป)" });
    }

    // 2. เตรียมข้อมูลส่งไปที่ SlipOK
    const slipFormData = new FormData();
    slipFormData.append('files', fs.createReadStream(slipFile.filepath));
    slipFormData.append('log', 'true');

    // ดึง Key จาก Vercel (SLIPOK_KEY ที่คุณตั้งไว้คือ SLIPOK0IHUY7U)
    const SLIPOK_API_KEY = process.env.SLIPOK_KEY;

    const slipResponse = await fetch("https://api.slipok.com/api/line/apikey/61738", {
      method: "POST",
      headers: {
        "x-lib-apikey": process.env.SLIPOK_KEY // ✅ แก้ไข Header ให้ตรงตามที่ API ต้องการ
      },
      body: slipFormData
    });

    const result = await slipResponse.json();

    // เช็คผลลัพธ์จาก SlipOK
    if (!result.success) {
      return res.status(400).json({ message: result.message || "สลิปไม่ถูกต้อง" });
    }

    // 3. ดึงยอดเงินและรหัสอ้างอิง
    const amount = Number(result.data.amount);
    const transactionId = result.data.transRef || result.data.transaction_id;

    // 4. เชื่อมต่อ Supabase (ใช้ Service Role Key เพื่อรัน RPC)
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

    // 🔒 ป้องกันการใช้สลิปซ้ำ
    const { data: existing } = await supabase
      .from("topups")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: "สลิปนี้ถูกใช้งานไปแล้ว" });
    }

    // 💰 อัปเดตยอดเงินในตาราง profiles (เรียก RPC ที่คุณสร้างไว้)
    const { error: rpcError } = await supabase.rpc("increment_balance", {
      uid_input: uid,
      amount_input: amount
    });

    if (rpcError) throw new Error("Update balance failed: " + rpcError.message);

    // 🧾 บันทึกประวัติลงตาราง topups
    await supabase.from("topups").insert({
      user_id: uid,
      amount: amount,
      transaction_id: transactionId
    });

    return res.status(200).json({ success: true, amount });

  } catch (err) {
    console.error("Critical Error:", err);
    return res.status(500).json({ message: "Server Error: " + err.message });
  }
}
