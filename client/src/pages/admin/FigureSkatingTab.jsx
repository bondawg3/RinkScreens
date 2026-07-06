import React from 'react';
import CalendarEventsTab from './CalendarEventsTab';

export default function FigureSkatingTab() {
  return (
    <CalendarEventsTab
      endpoint="/figure-skating"
      heading="Figure Skating"
      hint="Events pulled from Figure Skating calendars configured in the Calendars tab."
      emptyLabel="figure skating events"
      displayType="figure_skating"
      calendarType="figure_skating"
    />
  );
}
