import nodemailer from 'nodemailer';
import type { SearchResult, WatchItem } from '../types';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER와 EMAIL_PASS를 설정해야 알림을 보낼 수 있습니다.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

function safe(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

export async function sendPriceAlert(item: WatchItem, result: SearchResult): Promise<void> {
  const offer = result.lowestOffer;
  const rows = result.offers.slice(0, 3).map((value, index) => `
    <tr>
      <td style="padding:11px;border-bottom:1px solid #eee">${index + 1}. ${safe(value.seller)}</td>
      <td style="padding:11px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${value.price.toLocaleString()}원</td>
      <td style="padding:11px;border-bottom:1px solid #eee;text-align:right"><a href="${safe(value.productUrl)}">상품 보기</a></td>
    </tr>`).join('');

  await getTransporter().sendMail({
    from: `"최저가 레이더" <${process.env.EMAIL_USER}>`,
    to: item.email,
    subject: `[최저가 알림] ${item.keyword} ${offer.price.toLocaleString()}원`,
    html: `
      <div style="font-family:Arial,'Apple SD Gothic Neo',sans-serif;max-width:560px;margin:auto;background:#f7f8fa;padding:24px">
        <div style="background:#fff;border:1px solid #e5e8ec;border-radius:14px;overflow:hidden">
          <div style="background:#17191c;color:#fff;padding:24px">
            <small>PRICE RADAR · ${safe(result.provider.toUpperCase())}</small>
            <h1 style="margin:8px 0 0;font-size:23px">${safe(item.keyword)}</h1>
          </div>
          <div style="padding:28px;text-align:center">
            <p style="margin:0;color:#69717b">현재 확인된 최저가</p>
            <strong style="display:block;margin:8px 0;color:#e52528;font-size:34px">${offer.price.toLocaleString()}원</strong>
            <p style="margin:0;color:#369947">목표가 ${item.targetPrice.toLocaleString()}원 이하에 도달했습니다.</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
          <p style="padding:18px;margin:0;color:#8a9098;font-size:11px">가격과 재고는 판매처에서 최종 확인하세요.</p>
        </div>
      </div>`,
  });
}
