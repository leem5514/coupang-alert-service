import 'dotenv/config';
import { getProviderStatus } from './providers';

const provider = getProviderStatus();
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  📡 최저가 레이더');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  데이터 공급자: ${provider.label}`);
console.log(`  설정 상태: ${provider.configured ? '준비됨' : '설정 필요'}`);
console.log('');
console.log('웹 대시보드는 npm run dev로 실행하세요.');
