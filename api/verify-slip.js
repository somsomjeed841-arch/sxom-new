import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// สำคัญ: ปิด Body Parser ของ Vercel เพื่อให้ formidable จัดการไฟล์ได้
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({});

  try {
    // 1. รับค่าจากหน้าบ้าน (UID และ ไฟล์สลิป)
    const [fields, files] = await form.parse(req);
    const uid = fields.uid?.[0]; 
    const slipFile = files.files?.[0]; // ชื่อฟิลด์ "files" ตามใน payment.html

    if (!uid || !slipFile) {
      return res.status(400).json({ message: "กรุณาแนบสลิปหรือตรวจสอบการเข้าสู่ระบบ" });
    }

    // 2. เตรียมส่งไฟล์ไปตรวจสอบที่ SlipOK
    const slipFormData = new FormData();
    slipFormData.append('files', fs.createReadStream(slipFile.filepath));
    slipFormData.append('log', 'true');

    const slipResponse = await fetch("https://api.slipok.com/api/line/apikey/61738", {
      method: "POST",
      headers: {
        "x-lib-apikey": process.env.SLIPOK_KEY // ใช้ค่าจาก Environment Variables ใน Vercel
      },
      body: slipFormData
    });

    const result = await slipResponse.json();

    // ตรวจสอบว่าสลิปถูกต้องหรือไม่
    if (!result.success) {
      return res.status(400).json({ message: result.message || "สลิปไม่ถูกต้อง" });
    }

    // 3. ดึงข้อมูลจากสลิป (จำนวนเงิน และ รหัสอ้างอิง)
    const amount = Number(result.data.amount);
    const transactionId = result.data.transRef || result.data.transaction_id;

    // เชื่อมต่อ Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 4. ป้องกันการใช้สลิปซ้ำ (ตรวจสอบในตาราง topups)
    const { data: existing } = await supabase
      .from("topups")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: "สลิปนี้ถูกใช้งานไปแล้ว" });
    }

    // 5. เพิ่มเงินเข้าบัญชี (เรียกใช้ RPC: increment_balance ตามรูปที่ 7)
    const { error: rpcError } = await supabase.rpc("increment_balance", {
      uid_input: uid,
      amount_input: amount
    });

    if (rpcError) throw new Error("ไม่สามารถอัปเดตยอดเงินได้: " + rpcError.message);

    // 6. บันทึกประวัติการเติมเงิน
    await supabase.from("topups").insert({
      user_id: uid,
      amount: amount,
      transaction_id: transactionId
    });

    return res.status(200).json({ success: true, amount });

  } catch (err) {
    console.error("Critical Error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: " + err.message });
  }
}
