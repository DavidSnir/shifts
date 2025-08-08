import React, { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { CalendarDayScroller } from './calendar/CalendarDayScroller'

export default function CalendarTab() {
    const [selectedDate, setSelectedDate] = useState(() => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    });

    // Ensure we always land on today when opening the tab
    // If the component remounts after navigation, this re-centers the view
    React.useEffect(() => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const iso = `${year}-${month}-${day}`;
      if (selectedDate !== iso) setSelectedDate(iso);
    }, []);
  
    // Calendar events removed; using mission-based columns in CalendarDayScroller
  
    // const formatDateDisplay = (dateStr: string) => {
    //   const date = new Date(dateStr + 'T00:00:00');
    //   const today = new Date();
    //   const tomorrow = new Date(today);
    //   tomorrow.setDate(today.getDate() + 1);
    //   const yesterday = new Date(today);
    //   yesterday.setDate(today.getDate() - 1);
  
    //   const isToday = dateStr === today.toISOString().split('T')[0];
    //   const isTomorrow = dateStr === tomorrow.toISOString().split('T')[0];
    //   const isYesterday = dateStr === yesterday.toISOString().split('T')[0];
  
    //   if (isToday) return 'Today';
    //   if (isTomorrow) return 'Tomorrow';
    //   if (isYesterday) return 'Yesterday';
  
    //   return date.toLocaleDateString('en-US', { 
    //     weekday: 'long', 
    //     month: 'long', 
    //     day: 'numeric',
    //     year: 'numeric'
    //   });
    // };
  
    const jumpToToday = () => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
    };
  
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
  
  
        {/* Calendar Day Scroller */}
        <CalendarDayScroller 
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onJumpToToday={jumpToToday}
          missions={useQuery(api.people.listMissions) as any}
        />
      </div>
    );
  }