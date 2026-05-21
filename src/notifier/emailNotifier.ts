import nodemailer from 'nodemailer';
import type { WatchItem, SearchResult } from '../types';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

export async function sendPriceAlert(
  item: WatchItem,
  result: SearchResult
): Promise<void> {
  const { lowestProduct, products } = result;
  const drop = item.targetPrice - lowestProduct.price;
  const dropPct = Math.round((drop / item.targetPrice) * 100);

  const topThree = products.slice(0, 3);
  const tableRows = topThree
    .map(
      (p, i) => `
      <tr style="background:${i === 0 ? '#fff8e1' : '#fff'}">
        <td style="padding:10px 14px;font-weight:${i === 0 ? '700' : '400'}">${i + 1}위 ${p.seller}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:${i === 0 ? '700' : '400'};color:${i === 0 ? '#e53935' : '#333'}">
          ${p.price.toLocaleString()}원
        </td>
        <td style="padding:10px 14px;text-align:center">
          <a href="${p.productUrl}" style="background:#e53935;color:#fff;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:13px">바로가기</a>
        </td>
      </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Apple SD Gothic Neo',sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#e53935;padding:24px 28px">
      <p style="color:#fff;margin:0;font-size:13px;opacity:0.85">🔔 가격 알림</p>
      <h1 style="color:#fff;margin:8px 0 0;font-size:22px">${item.keyword}</h1>
      <p style="color:#fff;margin:6px 0 0;font-size:14px;opacity:0.9">목표가 ${item.targetPrice.toLocaleString()}원 이하 달성!</p>
    </div>
    <div style="padding:24px 28px;border-bottom:1px solid #f0f0f0;text-align:center">
      <p style="color:#999;margin:0 0 6px;font-size:13px">현재 최저가</p>
      <p style="color:#e53935;margin:0;font-size:36px;font-weight:700">${lowestProduct.price.toLocaleString()}원</p>
      <p style="color:#4caf50;margin:8px 0 0;font-size:14px">▼ 목표가보다 ${drop.toLocaleString()}원 (${dropPct}%) 저렴</p>
    </div>
    <div style="padding:20px 28px">
      <p style="font-size:14px;font-weight:600;color:#333;margin:0 0 12px">판매처별 가격 비교</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:10px 14px;text-align:left;font-weight:600;color:#666">판매처</th>
            <th style="padding:10px 14px;text-align:right;font-weight:600;color:#666">가격</th>
            <th style="padding:10px 14px;text-align:center;font-weight:600;color:#666">링크</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div style="background:#f9f9f9;padding:16px 28px;text-align:center">
      <p style="color:#bbb;margin:0;font-size:12px">쿠팡 가격 알림 서비스 · 가격은 변동될 수 있습니다</p>
    </div>
  </div>
</body>
</html>`;

  await getTransporter().sendMail({
    from: `"가격알림 🔔" <${process.env.EMAIL_USER}>`,
    to: item.email,
    subject: `[가격알림] ${item.keyword} 목표가 도달! ${lowestProduct.price.toLocaleString()}원`,
    html,
  });

  console.log(`[Email] "${item.keyword}" 알림 발송 완료 → ${item.email}`);
}