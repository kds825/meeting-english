import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './components';
import { Drive } from './screens/Drive';
import { Home } from './screens/Home';
import { Listening } from './screens/Listening';
import { Reading } from './screens/Reading';
import { Review } from './screens/Review';
import { RoleplayScreen } from './screens/Roleplay';
import { Speaking } from './screens/Speaking';
import { Vocab } from './screens/Vocab';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '홈', icon: 'home' },
  { to: '/vocab', label: '단어장', icon: 'book' },
  { to: '/review', label: '복습', icon: 'cards' },
  { to: '/drive', label: '운전', icon: 'car' },
];

function BottomNav() {
  const { pathname } = useLocation();
  // 듣기·역할극·읽기·30초 답변은 학습 흐름에 집중하고, 운전 모드는 전체 화면이다
  if (!TABS.some((tab) => tab.to === pathname) || pathname === '/drive') return null;
  return (
    <nav className="bottom-nav" aria-label="주 메뉴">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end>
            <Icon name={tab.icon} />
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/listening" element={<Listening />} />
        <Route path="/roleplay" element={<RoleplayScreen />} />
        <Route path="/reading" element={<Reading />} />
        <Route path="/vocab" element={<Vocab />} />
        <Route path="/speaking" element={<Speaking />} />
        <Route path="/review" element={<Review />} />
        <Route path="/drive" element={<Drive />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  );
}
