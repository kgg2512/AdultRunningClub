import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.g2company.arc',
  appName: 'ARC — Running Society',
  webDir: '.',

  // CISO 보안 요건 (필수)
  server: {
    allowMixedContent: false,
    cleartext: false,
  },

  ios: {
    // 앱 내 도메인 외 외부 내비게이션 차단
    limitsNavigationsToAppBoundDomains: true,
    contentInset: 'automatic',
    // 스크롤 튕김 비활성화 (네이티브 느낌)
    scrollEnabled: false,
  },

  android: {
    allowMixedContent: false,
    // 백 버튼 동작 설정
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    // GPS 위치 (러닝 트래킹)
    Geolocation: {
      // iOS: 항상 위치 vs 앱 사용 중만 — 러닝 트래킹은 앱 사용 중으로 충분
    },

    // 로컬 알림 (이벤트 리마인더)
    LocalNotifications: {
      smallIcon: 'ic_stat_arc_notify',
      iconColor: '#C9A84C',
      sound: 'default',
    },

    // 푸시 알림
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0A0908',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },

    StatusBar: {
      style: 'dark',
      backgroundColor: '#0A0908',
    },
  },
};

export default config;
