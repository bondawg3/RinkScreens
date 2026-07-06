import React from 'react';
import CalendarEventsTab from './CalendarEventsTab';

export default function RinkEventsTab() {
  return (
    <CalendarEventsTab
      endpoint="/rink-events"
      heading="Rink Events"
      hint="Events pulled from Rink Events calendars configured in the Calendars tab."
      emptyLabel="rink events"
      displayType="rink_events"
      calendarType="rink_events"
    />
  );
}
