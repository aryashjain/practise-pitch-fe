import React, { useEffect, useRef, useState } from 'react';

interface NavbarProps {
userEmail?: string;
userName?: string;
onShowCreate: () => void;
onShowResults: () => void;
onSignOut: () => void;
}

export default function Navbar({ userEmail, userName,
onShowCreate, onShowResults, onSignOut }: NavbarProps) {
const [menuOpen, setMenuOpen] = useState(false);
const menuRef = useRef<HTMLDivElement | null>(null);

const initial = (userName || userEmail ||
'U').charAt(0).toUpperCase();

// Close on outside click, persist when clicked open
useEffect(() => {
const handleOutside = (e: MouseEvent) => {
if (!menuRef.current) return;
if (menuOpen && !menuRef.current.contains(e.target as
Node)) {
setMenuOpen(false);
}
};
document.addEventListener('mousedown', handleOutside);
return () => document.removeEventListener('mousedown',
handleOutside);
}, [menuOpen]);

return (
<nav className="sticky top-0 z-50 w-full bg-white/80
backdrop-blur border-b border-gray-200">
<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14
flex items-center justify-between">
<div className="flex items-center gap-6">
<button
onClick={onShowCreate}
className="text-sm font-medium text-gray-800
hover:text-blue-700 cursor-pointer"
>
Create practise-pitch
</button>
<button
onClick={onShowResults}

className="text-sm font-medium text-gray-800
hover:text-blue-700 cursor-pointer"
>
My past practises
</button>
</div>
<div
className="relative"
ref={menuRef}
>
<button
onClick={() => setMenuOpen((v) => !v)}
className="h-9 w-9 rounded-full bg-gray-200
text-gray-800 flex items-center justify-center font-semibold
cursor-pointer border border-gray-300 hover:bg-gray-300"
aria-haspopup="menu"
aria-expanded={menuOpen}
>
{initial}
</button>
{menuOpen && (
<div className="absolute right-0 mt-2 w-56 bg-white
border border-gray-200 rounded-lg shadow-lg p-2">
{(userName || userEmail) && (
<div className="px-2 py-2 border-b
border-gray-100">
{userName && <div className="text-sm
font-medium text-gray-800 truncate">{userName}</div>}
{userEmail && <div className="text-xs
text-gray-600 truncate">{userEmail}</div>}
</div>
)}

<button
onClick={onSignOut}
className="w-full text-left px-3 py-2 text-sm
rounded-md hover:bg-red-50 text-red-600 cursor-pointer"
>
Sign Out
</button>
</div>
)}
</div>
</div>
</nav>
);
}