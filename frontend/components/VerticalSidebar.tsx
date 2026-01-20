'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutPanelTopIcon } from '@/components/icons/LayoutPanelTopIcon';
import type { LayoutPanelTopIconHandle } from '@/components/icons/LayoutPanelTopIcon';
import { LayersIcon } from '@/components/icons/LayersIcon';
import type { LayersIconHandle } from '@/components/icons/LayersIcon';
import { RocketIcon } from '@/components/icons/RocketIcon';
import type { RocketIconHandle } from '@/components/icons/RocketIcon';
import { FileStackIcon } from '@/components/icons/FileStackIcon';
import type { FileStackIconHandle } from '@/components/icons/FileStackIcon';
import { SquareActivityIcon } from '@/components/icons/SquareActivityIcon';
import type { ActivityIconHandle } from '@/components/icons/SquareActivityIcon';
import { GitForkIcon } from '@/components/icons/GitForkIcon';
import type { GitForkIconHandle } from '@/components/icons/GitForkIcon';

interface VerticalSidebarProps {
  activeTab: 'data-management' | 'campaign-management' | 'campaign-automation' | 'reports' | 'monitor' | 'disposition-tree';
  onTabChange: (tab: 'data-management' | 'campaign-management' | 'campaign-automation' | 'reports' | 'monitor' | 'disposition-tree') => void;
}

interface NavItem {
  id: 'data-management' | 'campaign-management' | 'campaign-automation' | 'reports' | 'monitor' | 'disposition-tree';
  label: string;
  icon: React.ReactNode;
  color: string;
  hoverColor: string;
}

export function VerticalSidebar({ activeTab, onTabChange }: VerticalSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Create refs for each icon
  const iconRefs = useRef<{
    'data-management': LayoutPanelTopIconHandle | null;
    'campaign-management': LayersIconHandle | null;
    'campaign-automation': RocketIconHandle | null;
    'reports': FileStackIconHandle | null;
    'monitor': ActivityIconHandle | null;
    'disposition-tree': GitForkIconHandle | null;
  }>({
    'data-management': null,
    'campaign-management': null,
    'campaign-automation': null,
    'reports': null,
    'monitor': null,
    'disposition-tree': null,
  });

  const navItems: NavItem[] = [
    {
      id: 'data-management',
      label: 'Data Management',
      icon: <LayoutPanelTopIcon ref={(el) => { iconRefs.current['data-management'] = el; }} size={20} />,
      color: 'from-blue-500 to-blue-600',
      hoverColor: 'hover:from-blue-600 hover:to-blue-700',
    },
    {
      id: 'campaign-management',
      label: 'Campaign Management',
      icon: <LayersIcon ref={(el) => { iconRefs.current['campaign-management'] = el; }} size={20} />,
      color: 'from-purple-500 to-purple-600',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700',
    },
    {
      id: 'campaign-automation',
      label: 'Campaign Automation',
      icon: <RocketIcon ref={(el) => { iconRefs.current['campaign-automation'] = el; }} size={20} />,
      color: 'from-indigo-500 to-indigo-600',
      hoverColor: 'hover:from-indigo-600 hover:to-indigo-700',
    },
    {
      id: 'monitor',
      label: 'Monitor',
      icon: <SquareActivityIcon ref={(el) => { iconRefs.current['monitor'] = el; }} size={20} />,
      color: 'from-emerald-500 to-emerald-600',
      hoverColor: 'hover:from-emerald-600 hover:to-emerald-700',
    },
    {
      id: 'disposition-tree',
      label: 'Disposition Tree',
      icon: <div className="rotate-180"><GitForkIcon ref={(el) => { iconRefs.current['disposition-tree'] = el; }} size={20} /></div>,
      color: 'from-teal-500 to-teal-600',
      hoverColor: 'hover:from-teal-600 hover:to-teal-700',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <FileStackIcon ref={(el) => { iconRefs.current['reports'] = el; }} size={20} />,
      color: 'from-orange-500 to-orange-600',
      hoverColor: 'hover:from-orange-600 hover:to-orange-700',
    },
  ];

  const handleButtonMouseEnter = (itemId: typeof activeTab) => {
    const iconRef = iconRefs.current[itemId];
    if (iconRef) {
      iconRef.startAnimation();
    }
  };

  const handleButtonMouseLeave = (itemId: typeof activeTab) => {
    const iconRef = iconRefs.current[itemId];
    if (iconRef) {
      iconRef.stopAnimation();
    }
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full transition-all duration-300 ease-in-out z-40 ${
        isExpanded ? 'w-64 bg-[var(--card-bg)] shadow-lg' : 'w-14 bg-transparent'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={`flex flex-col h-full transition-all duration-300 ${isExpanded ? 'py-8' : 'py-6'}`}>
        {/* Logo/Brand Area */}
        <div className={`mb-8 flex items-center gap-3 overflow-hidden transition-all duration-300 ${isExpanded ? 'px-4' : 'px-2'}`}>
          <div className={`rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 ${
            isExpanded ? 'w-11 h-11' : 'w-9 h-9'
          }`}>
            <span className={`text-white font-bold transition-all duration-300 ${isExpanded ? 'text-base' : 'text-xs'}`}>CMS</span>
          </div>
          <div
            className={`whitespace-nowrap transition-all duration-300 ${
              isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            }`}
          >
            <h2 className="text-lg font-bold text-[var(--foreground)]">Campaign</h2>
            <p className="text-xs text-[var(--secondary)]">Management</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className={`flex-1 space-y-2 transition-all duration-300 ${isExpanded ? 'px-3' : 'px-1.5'}`}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                onMouseEnter={() => handleButtonMouseEnter(item.id)}
                onMouseLeave={() => handleButtonMouseLeave(item.id)}
                className={`w-full flex items-center rounded-lg transition-all duration-300 group relative overflow-hidden ${
                  isExpanded ? 'gap-3 px-4 py-3' : 'gap-2 px-2 py-2.5'
                } ${
                  isActive
                    ? `bg-gradient-to-r ${item.color} text-white shadow-lg`
                    : `text-[var(--secondary)] hover:text-[var(--foreground)] hover:bg-[var(--table-row-hover)]`
                }`}
                title={!isExpanded ? item.label : ''}
              >
                {/* Animated background on hover */}
                {!isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--primary)]/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"></div>
                )}

                {/* Icon */}
                <div className="relative z-10 flex items-center justify-center">
                  {item.icon}
                </div>

                {/* Label */}
                <span
                  className={`relative z-10 font-medium text-sm whitespace-nowrap transition-all duration-300 ${
                    isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 absolute'
                  }`}
                >
                  {item.label}
                </span>

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-l-full"></div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Expand/Collapse Hint */}
        <div className={`mt-4 transition-all duration-300 ${isExpanded ? 'px-3' : 'px-1.5'}`}>
          <div
            className={`text-xs text-[var(--secondary)] text-center transition-all duration-300 ${
              isExpanded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Hover to expand
          </div>
        </div>
      </div>

      {/* Glow effect on active item */}
      <style jsx>{`
        button:hover::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 0.5rem;
          padding: 1px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.3s;
        }
        
        button:hover::after {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
