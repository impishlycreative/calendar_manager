/**
 * CalendarManager
 * ===============
 *
 * Shared Google Apps Script class for managing the KCW Google Calendar.
 *
 * CalendarManager:
 *   - Receives configuration through ResourceManager.
 *   - Authenticates using a Google Service Account.
 *   - Uses the Google Calendar REST API.
 *   - Reads calendar events.
 *   - Adds calendar events.
 *   - Updates calendar events.
 *   - Normalizes Google Calendar data into KCW event objects.
 *   - Stores KCW-specific metadata in the Calendar description.
 *   - Validates Calendar data before returning it.
 *   - Returns plain structured objects or JSON.
 *   - Calculates whether events are Upcoming or Archived.
 *
 *
 * RESOURCE MANAGER SETTINGS
 * -------------------------
 *
 * CALENDAR_ID
 *   ID of the Google Calendar being managed.
 *
 * CALENDAR_API_KEY
 *   Public API key used by the KCW static website when reading the
 *   same public calendar.
 *
 *   CalendarManager itself uses Service Account OAuth2 and therefore
 *   does not require this key for its authenticated REST requests.
 *
 * CALENDAR_TIMEZONE
 *   Timezone used by the KCW calendar.
 *   Normally:
 *
 *       America/Toronto
 *
 * CALENDAR_DAYS_AHEAD
 *   Number of days into the future retrieved for upcoming events.
 *
 * CALENDAR_ARCHIVE_DAYS
 *   Number of days into the past retrieved for archived events.
 *
 *
 * SCRIPT PROPERTY
 * ---------------
 *
 * SERVICE_ACCOUNT_KEY
 *
 * Contains the complete Service Account JSON credential.
 *
 * Example structure:
 *
 * {
 *   "type": "service_account",
 *   "project_id": "...",
 *   "private_key_id": "...",
 *   "private_key": "...",
 *   "client_email": "...",
 *   "client_id": "...",
 *   "token_uri": "https://oauth2.googleapis.com/token"
 * }
 *
 * The Service Account must have access to CALENDAR_ID.
 *
 *
 * REQUIRED APPS SCRIPT LIBRARY
 * ----------------------------
 *
 * OAuth2
 *
 *
 * SECURITY MODEL
 * --------------
 *
 * Calendar data is treated as untrusted input.
 *
 * CalendarManager validates:
 *
 *   - Event IDs
 *   - Text values
 *   - Maximum lengths
 *   - Dates
 *   - Times
 *   - Timezones
 *   - Booleans
 *   - HTTPS URLs
 *   - Image paths
 *   - Publication status
 *   - Metadata structure
 *   - Relationships between fields
 *
 * CalendarManager returns plain structured data.
 *
 * It does NOT attempt to make strings universally "HTML safe".
 * The website must still perform context-specific output encoding
 * when inserting values into HTML, attributes, URLs, etc.
 */
class CalendarManager {

  /**
   * @param {ResourceManager} resourceManager
   */
  constructor(resourceManager) {

    if (
      !resourceManager ||
      typeof resourceManager.get !== "function"
    ) {
      throw new Error(
        "CalendarManager: A valid ResourceManager instance is required."
      );
    }

    this.resources = resourceManager;

    // ----------------------------------------------------------
    // Calendar configuration
    // ----------------------------------------------------------

    this.calendarId =
      this._requireResource_("CALENDAR_ID");

    /*
     * Retained as part of the shared Calendar configuration because
     * the public static website uses this key to access the same
     * public Google Calendar.
     *
     * CalendarManager itself authenticates with OAuth2.
     */
    this.apiKey =
      this._requireResource_("CALENDAR_API_KEY");

    this.timezone =
      this._validateTimezone_(
        this.resources.get("CALENDAR_TIMEZONE") ||
        "America/Toronto"
      );

    this.daysAhead =
      this._positiveInteger_(
        this.resources.get("CALENDAR_DAYS_AHEAD"),
        21
      );

    this.archiveDays =
      this._positiveInteger_(
        this.resources.get("CALENDAR_ARCHIVE_DAYS"),
        365
      );

    // ----------------------------------------------------------
    // Google Calendar API
    // ----------------------------------------------------------

    this.calendarApiBase =
      "https://www.googleapis.com/calendar/v3";

    // ----------------------------------------------------------
    // KCW controlled values
    // ----------------------------------------------------------

    this.allowedStatuses = [
      "Draft",
      "Published"
    ];

    this.allowedStates = [
      "Upcoming",
      "Archived"
    ];
  }


  // ============================================================
  // PUBLIC API
  // ============================================================


  /**
   * Reads one event by Google Calendar event ID.
   *
   * @param {string} eventId
   * @return {Object|null}
   */
  read(eventId) {

    eventId =
      this._validateId_(eventId);

    const url =
      this.calendarApiBase +
      "/calendars/" +
      encodeURIComponent(this.calendarId) +
      "/events/" +
      encodeURIComponent(eventId);

    const response =
      this._authenticatedFetch_(
        url,
        {
          method: "get"
        }
      );

    const code =
      response.getResponseCode();

    if (code === 404) {
      return null;
    }

    this._requireSuccess_(
      response,
      "read calendar event"
    );

    const raw =
      this._parseJsonResponse_(response);

    return this._normalizeCalendarEvent_(raw);
  }


  /**
   * Adds an event.
   *
   * @param {Object} eventData
   * @return {Object}
   */
  add(eventData) {

    const event =
      this._validateInputEvent_(eventData);

    const googleEvent =
      this._buildGoogleCalendarEvent_(event);

    const url =
      this.calendarApiBase +
      "/calendars/" +
      encodeURIComponent(this.calendarId) +
      "/events";

    const response =
      this._authenticatedFetch_(
        url,
        {
          method: "post",

          contentType:
            "application/json; charset=utf-8",

          payload:
            JSON.stringify(googleEvent)
        }
      );

    this._requireSuccess_(
      response,
      "create calendar event"
    );

    const created =
      this._parseJsonResponse_(response);

    return this._normalizeCalendarEvent_(created);
  }


  /**
   * Updates an existing event.
   *
   * PATCH is used so Google-managed properties that are not supplied
   * by KCW are not unnecessarily replaced.
   *
   * @param {string} eventId
   * @param {Object} eventData
   * @return {Object}
   */
  update(eventId, eventData) {

    eventId =
      this._validateId_(eventId);

    const event =
      this._validateInputEvent_(eventData);

    const googleEvent =
      this._buildGoogleCalendarEvent_(event);

    const url =
      this.calendarApiBase +
      "/calendars/" +
      encodeURIComponent(this.calendarId) +
      "/events/" +
      encodeURIComponent(eventId);

    const response =
      this._authenticatedFetch_(
        url,
        {
          method: "patch",

          contentType:
            "application/json; charset=utf-8",

          payload:
            JSON.stringify(googleEvent)
        }
      );

    this._requireSuccess_(
      response,
      "update calendar event"
    );

    const updated =
      this._parseJsonResponse_(response);

    return this._normalizeCalendarEvent_(updated);
  }


  /**
   * Deletes an existing event.
   *
   * @param {string} eventId
   * @return {boolean}
   */
  remove(eventId) {

    eventId =
      this._validateId_(eventId);

    const url =
      this.calendarApiBase +
      "/calendars/" +
      encodeURIComponent(this.calendarId) +
      "/events/" +
      encodeURIComponent(eventId);

    const response =
      this._authenticatedFetch_(
        url,
        {
          method: "delete"
        }
      );

    const code =
      response.getResponseCode();

    if (code === 404) {
      return false;
    }

    this._requireSuccess_(
      response,
      "delete calendar event"
    );

    return true;
  }


  /**
   * Retrieves events.
   *
   * options.state:
   *
   *   Upcoming
   *   Archived
   *   All
   *
   * options.status:
   *
   *   Published
   *   Draft
   *   All
   *
   * Defaults:
   *
   *   state  = Upcoming
   *   status = Published
   *
   * @param {Object=} options
   * @return {Object[]}
   */
  list(options) {

    options =
      options || {};

    const requestedState =
      options.state || "Upcoming";

    const requestedStatus =
      options.status || "Published";

    this._validateStateFilter_(
      requestedState
    );

    this._validateStatusFilter_(
      requestedStatus
    );

    const now =
      new Date();

    const archiveStart =
      new Date(
        now.getTime() -
        (
          this.archiveDays *
          24 *
          60 *
          60 *
          1000
        )
      );

    const futureEnd =
      new Date(
        now.getTime() +
        (
          this.daysAhead *
          24 *
          60 *
          60 *
          1000
        )
      );

    let timeMin;
    let timeMax;

    switch (requestedState) {

      case "Upcoming":

        timeMin =
          now;

        timeMax =
          futureEnd;

        break;


      case "Archived":

        timeMin =
          archiveStart;

        timeMax =
          now;

        break;


      case "All":

        timeMin =
          archiveStart;

        timeMax =
          futureEnd;

        break;


      default:

        throw new Error(
          "CalendarManager: Invalid state."
        );
    }

    const rawEvents =
      this._fetchEvents_(
        timeMin,
        timeMax
      );

    const events = [];

    rawEvents.forEach(rawEvent => {

      try {

        const event =
          this._normalizeCalendarEvent_(
            rawEvent
          );

        if (!event) {
          return;
        }

        if (
          requestedStatus !== "All" &&
          event.status !== requestedStatus
        ) {
          return;
        }

        if (
          requestedState !== "All" &&
          event.state !== requestedState
        ) {
          return;
        }

        events.push(event);

      } catch (error) {

        /*
         * Reject malformed events without exposing their raw
         * Calendar content in logs.
         */
        console.warn(
          "CalendarManager: Calendar event rejected: " +
          error.message
        );
      }
    });

    events.sort(
      (a, b) =>
        new Date(a.startDateTime).getTime() -
        new Date(b.startDateTime).getTime()
    );

    return events;
  }


  /**
   * Returns upcoming Published events.
   *
   * @return {Object[]}
   */
  getUpcomingEvents() {

    return this.list({
      state: "Upcoming",
      status: "Published"
    });
  }


  /**
   * Returns archived Published events.
   *
   * @return {Object[]}
   */
  getArchivedEvents() {

    return this.list({
      state: "Archived",
      status: "Published"
    });
  }


  /**
   * Returns events as JSON.
   *
   * @param {Object=} options
   * @return {string}
   */
  toJSON(options) {

    return JSON.stringify(
      this.list(options)
    );
  }


  // ============================================================
  // SERVICE ACCOUNT AUTHENTICATION
  // ============================================================


  /**
   * Configures the OAuth2 service used by CalendarManager.
   *
   * @return {Object}
   */
  _getServiceAccountService_() {

    const properties =
      PropertiesService.getScriptProperties();

    const rawKey =
      properties.getProperty(
        "SERVICE_ACCOUNT_KEY"
      );

    if (!rawKey) {

      throw new Error(
        'CalendarManager: Script property "SERVICE_ACCOUNT_KEY" ' +
        "is not configured."
      );
    }

    let jsonKey;

    try {

      jsonKey =
        JSON.parse(rawKey);

    } catch (error) {

      throw new Error(
        "CalendarManager: SERVICE_ACCOUNT_KEY contains invalid JSON."
      );
    }

    if (
      !jsonKey.client_email ||
      !jsonKey.private_key ||
      !jsonKey.token_uri
    ) {

      throw new Error(
        "CalendarManager: SERVICE_ACCOUNT_KEY is missing required fields."
      );
    }

    return OAuth2
      .createService(
        "KCWCalendarServiceAccount"
      )
      .setTokenUrl(
        jsonKey.token_uri
      )
      .setPrivateKey(
        jsonKey.private_key
      )
      .setIssuer(
        jsonKey.client_email
      )
      .setPropertyStore(
        properties
      )
      .setScope(
        "https://www.googleapis.com/auth/calendar"
      );
  }


  /**
   * Returns an authenticated Service Account access token.
   *
   * @return {string}
   */
  _getAccessToken_() {

    const service =
      this._getServiceAccountService_();

    if (!service.hasAccess()) {

      throw new Error(
        "CalendarManager: Service Account authentication failed: " +
        service.getLastError()
      );
    }

    const token =
      service.getAccessToken();

    if (!token) {

      throw new Error(
        "CalendarManager: Service Account returned no access token."
      );
    }

    return token;
  }


  // ============================================================
  // AUTHENTICATED HTTP
  // ============================================================


  /**
   * Executes an authenticated Google Calendar API request.
   *
   * @param {string} url
   * @param {Object=} options
   * @return {HTTPResponse}
   */
  _authenticatedFetch_(url, options) {

    options =
      options || {};

    const headers =
      Object.assign(
        {},
        options.headers || {}
      );

    headers.Authorization =
      "Bearer " +
      this._getAccessToken_();

    options.headers =
      headers;

    options.muteHttpExceptions =
      true;

    return UrlFetchApp.fetch(
      url,
      options
    );
  }


  /**
   * Requires a successful HTTP response.
   *
   * Raw Google response content is deliberately not included
   * in the thrown exception.
   */
  _requireSuccess_(response, operation) {

    const code =
      response.getResponseCode();

    if (
      code >= 200 &&
      code < 300
    ) {
      return;
    }

    throw new Error(
      "CalendarManager: Unable to " +
      operation +
      ". Google Calendar API returned HTTP " +
      code +
      "."
    );
  }


  // ============================================================
  // GOOGLE CALENDAR RETRIEVAL
  // ============================================================


  /**
   * Retrieves raw Calendar events.
   *
   * Handles Google Calendar API pagination.
   *
   * @param {Date} timeMin
   * @param {Date} timeMax
   * @return {Object[]}
   */
  _fetchEvents_(timeMin, timeMax) {

    const events = [];

    let pageToken =
      null;

    do {

      let url =
        this.calendarApiBase +
        "/calendars/" +
        encodeURIComponent(this.calendarId) +
        "/events" +

        "?singleEvents=true" +

        "&orderBy=startTime" +

        "&timeMin=" +
        encodeURIComponent(
          timeMin.toISOString()
        ) +

        "&timeMax=" +
        encodeURIComponent(
          timeMax.toISOString()
        ) +

        "&maxResults=2500";

      if (pageToken) {

        url +=
          "&pageToken=" +
          encodeURIComponent(pageToken);
      }

      const response =
        this._authenticatedFetch_(
          url,
          {
            method: "get"
          }
        );

      this._requireSuccess_(
        response,
        "retrieve calendar events"
      );

      const data =
        this._parseJsonResponse_(
          response
        );

      if (
        Array.isArray(data.items)
      ) {

        data.items.forEach(item => {
          events.push(item);
        });
      }

      pageToken =
        data.nextPageToken || null;

    } while (pageToken);

    return events;
  }


  // ============================================================
  // NORMALIZATION
  // ============================================================


  /**
   * Converts a raw Google Calendar event into the standard
   * KCW event object.
   *
   * @param {Object} raw
   * @return {Object|null}
   */
  _normalizeCalendarEvent_(raw) {

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {

      throw new Error(
        "CalendarManager: Invalid Google Calendar event."
      );
    }

    /*
     * Cancelled events are not returned as active KCW events.
     */
    if (
      raw.status === "cancelled"
    ) {
      return null;
    }

    const metadata =
      this._parseMetadata_(
        raw.description || ""
      );

    const dateInfo =
      this._extractDateInformation_(
        raw
      );

    const event = {

      // --------------------------------------------------------
      // SCHEDULE METADATA
      // --------------------------------------------------------

      id:
        this._validateId_(
          raw.id
        ),

      type:
        this._validateText_(
          metadata.type || "Meeting",
          100
        ),

      title:
        this._validateText_(
          raw.summary || "",
          300
        ),

      description:
        this._validateText_(
          this._removeMetadataFromDescription_(
            raw.description || ""
          ),
          5000,
          true
        ),

      date:
        dateInfo.date,

      startTime:
        dateInfo.startTime,

      endTime:
        dateInfo.endTime,

      timezone:
        this._validateTimezone_(
          dateInfo.timezone ||
          this.timezone
        ),

      allDay:
        dateInfo.allDay,

      location:
        this._validateText_(
          raw.location || "",
          500,
          true
        ),

      address:
        this._validateText_(
          metadata.address || "",
          500,
          true
        ),

      directions:
        this._validateUrl_(
          metadata.directions,
          true
        ),

      status:
        this._validateStatus_(
          metadata.status === undefined
            ? (/\[KCW_METADATA\]/i.test(raw.description || "") ? "Draft" : "Published")
            : metadata.status
        ),


      // --------------------------------------------------------
      // EVENT METADATA
      // --------------------------------------------------------

      eventTitle:
        this._validateText_(
          metadata.eventTitle ||
          raw.summary ||
          "",
          300,
          true
        ),

      learningTopic:
        this._validateText_(
          metadata.learningTopic,
          1000,
          true
        ),

      learningOutcome:
        this._validateText_(
          metadata.learningOutcome,
          2000,
          true
        ),

      format:
        this._validateText_(
          metadata.format,
          500,
          true
        ),

      speaker:
        this._validateText_(
          metadata.speaker,
          300,
          true
        ),

      speakerRole:
        this._validateText_(
          metadata.speakerRole,
          300,
          true
        ),

      speakerUrl:
        this._validateUrl_(
          metadata.speakerUrl,
          true
        ),

      image:
        this._validateUrlOrPath_(
          metadata.image,
          true
        ),

      imageAlt:
        this._validateText_(
          metadata.imageAlt,
          500,
          true
        ),

      hoverText:
        this._validateText_(
          metadata.hoverText ?? "",
          500,
          true
        ) || null,

      featured:
        this._validateBoolean_(
          metadata.featured,
          false
        ),

      featureStart:
        this._validateDate_(
          metadata.featureStart,
          true
        ),

      featureEnd:
        this._validateDate_(
          metadata.featureEnd,
          true
        ),


      // --------------------------------------------------------
      // DERIVED METADATA
      // --------------------------------------------------------

      state:
        this._deriveState_(
          dateInfo.endDateTime
        ),

      startDateTime:
        dateInfo.startDateTime,

      endDateTime:
        dateInfo.endDateTime
    };

    this._validateRelationships_(
      event
    );

    return event;
  }


  // ============================================================
  // KCW METADATA
  // ============================================================


  /**
   * Parses KCW-specific metadata stored inside the Calendar
   * description.
   *
   * Example:
   *
   * Normal human-readable description.
   *
   * [KCW_METADATA]
   * {
   *   "type": "Guest Speaker",
   *   "status": "Published",
   *   "speaker": "Ross Fattori",
   *   "featured": true
   * }
   * [/KCW_METADATA]
   *
   * @param {string} description
   * @return {Object}
   */
  _parseMetadata_(description) {

    if (!description) {
      return {};
    }

    const text =
      String(description);

    if (
      text.length > 30000
    ) {

      throw new Error(
        "CalendarManager: Calendar description exceeds permitted length."
      );
    }

    const match =
      text.match(
        /\[KCW_METADATA\]([\s\S]*?)\[\/KCW_METADATA\]/i
      );

    if (!match) {
      return {};
    }

    const metadataText =
      match[1].trim();

    if (
      metadataText.length > 20000
    ) {

      throw new Error(
        "CalendarManager: KCW metadata exceeds permitted length."
      );
    }

    let metadata;

    try {

      metadata =
        JSON.parse(
          metadataText
        );

    } catch (error) {

      throw new Error(
        "CalendarManager: KCW metadata contains invalid JSON."
      );
    }

    if (
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {

      throw new Error(
        "CalendarManager: KCW metadata must be a JSON object."
      );
    }

    return metadata;
  }


  /**
   * Removes machine-readable KCW metadata from the description.
   *
   * @param {string} description
   * @return {string}
   */
  _removeMetadataFromDescription_(description) {

    return String(
      description || ""
    )
      .replace(
        /\[KCW_METADATA\][\s\S]*?\[\/KCW_METADATA\]/gi,
        ""
      )
      .trim();
  }


  /**
   * Builds a Calendar description containing the normal description
   * followed by KCW metadata.
   *
   * @param {Object} event
   * @return {string}
   */
  _buildCalendarDescription_(event) {

    const metadata = {

      type:
        event.type,

      eventTitle:
        event.eventTitle || "",

      status:
        event.status,

      learningTopic:
        event.learningTopic || "",

      learningOutcome:
        event.learningOutcome || "",

      format:
        event.format || "",

      speaker:
        event.speaker || "",

      speakerRole:
        event.speakerRole || "",

      speakerUrl:
        event.speakerUrl || "",

      image:
        event.image || "",

      imageAlt:
        event.imageAlt || "",

      hoverText:
        event.hoverText || null,

      address:
        event.address || "",

      directions:
        event.directions || "",

      featured:
        Boolean(
          event.featured
        ),

      featureStart:
        event.featureStart || "",

      featureEnd:
        event.featureEnd || ""
    };

    let result =
      this._removeMetadataFromDescription_(event.description || "");

    if (result) {
      result += "\n\n";
    }

    result +=
      "[KCW_METADATA]\n" +
      JSON.stringify(
        metadata,
        null,
        2
      ) +
      "\n[/KCW_METADATA]";

    return result;
  }


  // ============================================================
  // GOOGLE EVENT CREATION
  // ============================================================


  /**
   * Converts a validated KCW event into Google Calendar API format.
   *
   * @param {Object} event
   * @return {Object}
   */
  _buildGoogleCalendarEvent_(event) {

    const googleEvent = {

      summary:
        event.title,

      description:
        this._buildCalendarDescription_(
          event
        )
    };

    if (event.location) {

      googleEvent.location =
        event.location;
    }

    // ----------------------------------------------------------
    // All-day event
    // ----------------------------------------------------------

    if (event.allDay) {

      googleEvent.start = {
        date:
          event.date
      };

      /*
       * Google Calendar all-day end dates are exclusive.
       */
      googleEvent.end = {
        date:
          this._addDaysToDateString_(
            event.date,
            1
          )
      };

      return googleEvent;
    }

    // ----------------------------------------------------------
    // Timed event
    // ----------------------------------------------------------

    googleEvent.start = {

      dateTime:
        this._buildRfc3339DateTime_(
          event.date,
          event.startTime,
          event.timezone
        ),

      timeZone:
        event.timezone
    };

    googleEvent.end = {

      dateTime:
        this._buildRfc3339DateTime_(
          event.date,
          event.endTime,
          event.timezone
        ),

      timeZone:
        event.timezone
    };

    return googleEvent;
  }


  // ============================================================
  // DATE / TIME HANDLING
  // ============================================================


  /**
   * Extracts normalized date information from a Google event.
   *
   * @param {Object} raw
   * @return {Object}
   */
  _extractDateInformation_(raw) {

    if (
      !raw.start ||
      !raw.end
    ) {

      throw new Error(
        "CalendarManager: Calendar event is missing start/end information."
      );
    }

    // ----------------------------------------------------------
    // All-day event
    // ----------------------------------------------------------

    if (raw.start.date) {

      const startDate =
        this._validateDate_(
          raw.start.date
        );

      const googleExclusiveEnd =
        this._validateDate_(
          raw.end.date
        );

      return {

        date:
          startDate,

        startTime:
          null,

        endTime:
          null,

        timezone:
          this.timezone,

        allDay:
          true,

        startDateTime:
          this._buildRfc3339DateTime_(startDate, "00:00"),

        endDateTime:
          this._buildRfc3339DateTime_(googleExclusiveEnd, "00:00")
      };
    }

    // ----------------------------------------------------------
    // Timed event
    // ----------------------------------------------------------

    if (
      !raw.start.dateTime ||
      !raw.end.dateTime
    ) {

      throw new Error(
        "CalendarManager: Timed event is missing dateTime information."
      );
    }

    const start =
      new Date(
        raw.start.dateTime
      );

    const end =
      new Date(
        raw.end.dateTime
      );

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime())
    ) {

      throw new Error(
        "CalendarManager: Calendar event contains invalid date/time values."
      );
    }

    return {

      date:
        Utilities.formatDate(
          start,
          raw.start.timeZone || this.timezone,
          "yyyy-MM-dd"
        ),

      startTime:
        Utilities.formatDate(
          start,
          raw.start.timeZone || this.timezone,
          "HH:mm"
        ),

      endTime:
        Utilities.formatDate(
          end,
          raw.start.timeZone || this.timezone,
          "HH:mm"
        ),

      timezone:
        raw.start.timeZone ||
        this.timezone,

      allDay:
        false,

      startDateTime:
        start.toISOString(),

      endDateTime:
        end.toISOString()
    };
  }


  /**
   * Converts KCW date/time into RFC3339 UTC format.
   *
   * @param {string} date
   * @param {string} time
   * @return {string}
   */
  _buildRfc3339DateTime_(date, time, timezone) {

    this._validateDate_(
      date
    );

    this._validateTime_(
      time
    );

    const parsed =
      Utilities.parseDate(
        date + " " + time,
        timezone || this.timezone,
        "yyyy-MM-dd HH:mm"
      );

    if (
      isNaN(parsed.getTime())
    ) {

      throw new Error(
        "CalendarManager: Invalid date/time."
      );
    }

    return Utilities.formatDate(
      parsed,
      "UTC",
      "yyyy-MM-dd'T'HH:mm:ss'Z'"
    );
  }


  /**
   * Adds days to a YYYY-MM-DD date.
   *
   * @param {string} date
   * @param {number} days
   * @return {string}
   */
  _addDaysToDateString_(date, days) {

    this._validateDate_(
      date
    );

    const parts =
      date.split("-");

    const value =
      new Date(
        Date.UTC(
          Number(parts[0]),
          Number(parts[1]) - 1,
          Number(parts[2])
        )
      );

    value.setUTCDate(
      value.getUTCDate() +
      days
    );

    return Utilities.formatDate(
      value,
      "UTC",
      "yyyy-MM-dd"
    );
  }


  /**
   * Calculates event state.
   *
   * state is DERIVED.
   * It is not stored in Google Calendar.
   *
   * @param {string} endDateTime
   * @return {string}
   */
  _deriveState_(endDateTime) {

    const end =
      new Date(
        endDateTime
      );

    if (
      isNaN(end.getTime())
    ) {

      throw new Error(
        "CalendarManager: Cannot determine event state."
      );
    }

    return (
      end.getTime() <= Date.now()
        ? "Archived"
        : "Upcoming"
    );
  }


  // ============================================================
  // EVENT INPUT VALIDATION
  // ============================================================


  /**
   * Validates an event supplied to add() or update().
   *
   * @param {Object} data
   * @return {Object}
   */
  _validateInputEvent_(data) {

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {

      throw new Error(
        "CalendarManager: Event data must be an object."
      );
    }

    const allDay =
      this._validateBoolean_(
        data.allDay,
        false
      );

    const event = {

      // --------------------------------------------------------
      // Schedule metadata
      // --------------------------------------------------------

      type:
        this._validateText_(
          data.type || "Meeting",
          100
        ),

      title:
        this._validateText_(
          data.title,
          300
        ),

      description:
        this._validateText_(
          data.description,
          5000,
          true
        ),

      date:
        this._validateDate_(
          data.date
        ),

      startTime:
        allDay
          ? null
          : this._validateTime_(
              data.startTime
            ),

      endTime:
        allDay
          ? null
          : this._validateTime_(
              data.endTime
            ),

      timezone:
        this._validateTimezone_(data.timezone || this.timezone),

      allDay:
        allDay,

      location:
        this._validateText_(
          data.location,
          500,
          true
        ),

      address:
        this._validateText_(
          data.address,
          500,
          true
        ),

      directions:
        this._validateUrl_(
          data.directions,
          true
        ),

      status:
        this._validateStatus_(
          data.status === undefined ? "Draft" : data.status
        ),


      // --------------------------------------------------------
      // Event metadata
      // --------------------------------------------------------

      eventTitle:
        this._validateText_(
          data.eventTitle,
          300,
          true
        ),

      learningTopic:
        this._validateText_(
          data.learningTopic,
          1000,
          true
        ),

      learningOutcome:
        this._validateText_(
          data.learningOutcome,
          2000,
          true
        ),

      format:
        this._validateText_(
          data.format,
          500,
          true
        ),

      speaker:
        this._validateText_(
          data.speaker,
          300,
          true
        ),

      speakerRole:
        this._validateText_(
          data.speakerRole,
          300,
          true
        ),

      speakerUrl:
        this._validateUrl_(
          data.speakerUrl,
          true
        ),

      image:
        this._validateUrlOrPath_(
          data.image,
          true
        ),

      imageAlt:
        this._validateText_(
          data.imageAlt,
          500,
          true
        ),

      hoverText:
        this._validateText_(
          data.hoverText ?? "",
          500,
          true
        ) || null,

      featured:
        this._validateBoolean_(
          data.featured,
          false
        ),

      featureStart:
        this._validateDate_(
          data.featureStart,
          true
        ),

      featureEnd:
        this._validateDate_(
          data.featureEnd,
          true
        )
    };

    this._validateRelationships_(
      event
    );

    return event;
  }


  /**
   * Validates relationships between fields.
   *
   * @param {Object} event
   */
  _validateRelationships_(event) {

    if (
      !event.allDay &&
      event.startTime &&
      event.endTime &&
      event.endTime <= event.startTime
    ) {

      throw new Error(
        "CalendarManager: endTime must be later than startTime."
      );
    }

    if (
      event.image &&
      !event.imageAlt
    ) {

      throw new Error(
        "CalendarManager: imageAlt is required when image is provided."
      );
    }

    if (event.featured) {

      if (
        event.featureStart &&
        event.featureEnd &&
        event.featureEnd < event.featureStart
      ) {

        throw new Error(
          "CalendarManager: featureEnd cannot occur before featureStart."
        );
      }
    }
  }


  // ============================================================
  // PRIMITIVE VALIDATION
  // ============================================================


  /**
   * Validates text.
   *
   * @param {*} value
   * @param {number} maxLength
   * @param {boolean=} optional
   * @return {string}
   */
  _validateText_(value, maxLength, optional) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      if (optional) {
        return "";
      }

      throw new Error(
        "CalendarManager: Required text value is missing."
      );
    }

    if (
      typeof value !== "string"
    ) {

      value =
        String(value);
    }

    value =
      this._cleanText_(
        value
      );

    if (
      !value &&
      !optional
    ) {

      throw new Error(
        "CalendarManager: Required text value is empty."
      );
    }

    if (
      value.length >
      maxLength
    ) {

      throw new Error(
        "CalendarManager: Text exceeds maximum length of " +
        maxLength +
        "."
      );
    }

    return value;
  }


  /**
   * Removes non-printable control characters.
   *
   * Newlines and tabs remain permitted.
   *
   * @param {*} value
   * @return {string}
   */
  _cleanText_(value) {

    return String(value)
      .replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        ""
      )
      .trim();
  }


  /**
   * Validates Google Calendar event IDs.
   *
   * @param {*} value
   * @return {string}
   */
  _validateId_(value) {

    value =
      this._validateText_(
        value,
        1024
      );

    if (
      !/^[A-Za-z0-9_\-@.]+$/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Invalid event ID."
      );
    }

    return value;
  }


  /**
   * Validates YYYY-MM-DD.
   *
   * @param {*} value
   * @param {boolean=} optional
   * @return {string}
   */
  _validateDate_(value, optional) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      if (optional) {
        return "";
      }

      throw new Error(
        "CalendarManager: Required date is missing."
      );
    }

    value =
      String(value).trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Date must use YYYY-MM-DD."
      );
    }

    const parts =
      value.split("-");

    const year =
      Number(parts[0]);

    const month =
      Number(parts[1]);

    const day =
      Number(parts[2]);

    const test =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );

    if (
      test.getUTCFullYear() !== year ||
      test.getUTCMonth() !== month - 1 ||
      test.getUTCDate() !== day
    ) {

      throw new Error(
        "CalendarManager: Invalid calendar date."
      );
    }

    return value;
  }


  /**
   * Validates HH:mm.
   *
   * @param {*} value
   * @return {string}
   */
  _validateTime_(value) {

    value =
      String(
        value || ""
      ).trim();

    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Time must use HH:mm."
      );
    }

    return value;
  }


  /**
   * Validates timezone text.
   *
   * @param {*} value
   * @return {string}
   */
  _validateTimezone_(value) {

    value =
      this._validateText_(
        value,
        100
      );

    if (
      !/^[A-Za-z0-9_+\-\/]+$/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Invalid timezone."
      );
    }

    return value;
  }


  /**
   * Validates booleans.
   *
   * @param {*} value
   * @param {boolean} defaultValue
   * @return {boolean}
   */
  _validateBoolean_(value, defaultValue) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      return defaultValue;
    }

    if (
      typeof value === "boolean"
    ) {

      return value;
    }

    if (
      value === "true"
    ) {
      return true;
    }

    if (
      value === "false"
    ) {
      return false;
    }

    throw new Error(
      "CalendarManager: Invalid boolean value."
    );
  }


  /**
   * Validates publication status.
   *
   * @param {*} value
   * @return {string}
   */
  _validateStatus_(value) {

    value =
      this._validateText_(
        value,
        50
      );

    if (
      this.allowedStatuses.indexOf(
        value
      ) === -1
    ) {

      throw new Error(
        "CalendarManager: Invalid event status."
      );
    }

    return value;
  }


  /**
   * Validates HTTPS URLs.
   *
   * @param {*} value
   * @param {boolean=} optional
   * @return {string}
   */
  _validateUrl_(value, optional) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      if (optional) {
        return "";
      }

      throw new Error(
        "CalendarManager: Required URL is missing."
      );
    }

    value =
      this._validateText_(
        value,
        2048
      );

    if (
      !/^https:\/\//i.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Only HTTPS URLs are permitted."
      );
    }

    if (
      /[\u0000-\u001F\u007F]/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: URL contains invalid characters."
      );
    }

    return value;
  }


  /**
   * Validates an HTTPS image URL or relative website path.
   *
   * @param {*} value
   * @param {boolean=} optional
   * @return {string}
   */
  _validateUrlOrPath_(value, optional) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      if (optional) {
        return "";
      }

      throw new Error(
        "CalendarManager: Required image value is missing."
      );
    }

    value =
      this._validateText_(
        value,
        2048
      );

    if (
      /^https:\/\//i.test(
        value
      )
    ) {

      return this._validateUrl_(
        value
      );
    }

    if (
      !/^[A-Za-z0-9_\-./]+$/.test(
        value
      )
    ) {

      throw new Error(
        "CalendarManager: Invalid image path."
      );
    }

    if (
      value.indexOf("..") !== -1
    ) {

      throw new Error(
        "CalendarManager: Image path traversal is not permitted."
      );
    }

    return value;
  }


  // ============================================================
  // FILTER VALIDATION
  // ============================================================


  _validateStateFilter_(value) {

    const allowed = [
      "Upcoming",
      "Archived",
      "All"
    ];

    if (
      allowed.indexOf(
        value
      ) === -1
    ) {

      throw new Error(
        "CalendarManager: Invalid state filter."
      );
    }
  }


  _validateStatusFilter_(value) {

    const allowed = [
      "Published",
      "Draft",
      "All"
    ];

    if (
      allowed.indexOf(
        value
      ) === -1
    ) {

      throw new Error(
        "CalendarManager: Invalid status filter."
      );
    }
  }


  // ============================================================
  // JSON RESPONSE HANDLING
  // ============================================================


  /**
   * Parses a Google API JSON response.
   *
   * @param {HTTPResponse} response
   * @return {Object}
   */
  _parseJsonResponse_(response) {

    const text =
      response.getContentText();

    if (!text) {

      throw new Error(
        "CalendarManager: Empty response returned by Google Calendar."
      );
    }

    let parsed;

    try {

      parsed =
        JSON.parse(
          text
        );

    } catch (error) {

      throw new Error(
        "CalendarManager: Google Calendar returned invalid JSON."
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {

      throw new Error(
        "CalendarManager: Unexpected Google Calendar response."
      );
    }

    return parsed;
  }


  // ============================================================
  // RESOURCE CONFIGURATION
  // ============================================================


  /**
   * Gets a required ResourceManager value.
   *
   * @param {string} key
   * @return {string}
   */
  _requireResource_(key) {

    const value =
      this.resources.get(
        key
      );

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {

      throw new Error(
        'CalendarManager: Required resource "' +
        key +
        '" is missing.'
      );
    }

    return String(
      value
    ).trim();
  }


  /**
   * Converts configuration to a positive integer.
   *
   * @param {*} value
   * @param {number} defaultValue
   * @return {number}
   */
  _positiveInteger_(value, defaultValue) {

    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {

      return defaultValue;
    }

    const number =
      Number(
        value
      );

    if (
      !Number.isInteger(number) ||
      number < 1
    ) {

      throw new Error(
        "CalendarManager: Expected a positive integer configuration value."
      );
    }

    return number;
  }
}


/*
 * Export CalendarManager for use as a Google Apps Script
 * shared library.
 */
globalThis.CalendarManager =
  CalendarManager;


// ============================================================
// INTEGRATION TEST
// ============================================================


/**
 * CalendarManager integration test.
 *
 * Tests:
 *
 *   1. ResourceManager
 *   2. CalendarManager construction
 *   3. Service Account authentication
 *   4. Calendar write access
 *   5. Event creation
 *   6. Event read
 *   7. Event update
 *   8. Updated event read
 *   9. Event list retrieval
 *  10. JSON output
 *
 * IMPORTANT:
 *
 * This test creates a REAL Google Calendar event.
 *
 * The event is created with:
 *
 *     status = Draft
 *
 * so it will not be returned by the normal Published event queries.
 *
 * The event is intentionally NOT automatically deleted.
 * This allows the Calendar entry and its metadata to be manually
 * inspected after the test.
 */
function testCalendarManagerReadWrite() {

  Logger.log(
    "========================================"
  );

  Logger.log(
    " CalendarManager Read/Write Test"
  );

  Logger.log(
    "========================================"
  );


  // ----------------------------------------------------------
  // 1. RESOURCE MANAGER
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "1. Loading ResourceManager..."
  );

  const resources =
    new ResManagerLib.ResourceManager(
      "1ylZaY-v6-t6Afsn2FnEFJSYWYyFYMzUvlPWOQYC87OI",
      "Sheet1"
    );

  Logger.log(
    "ResourceManager loaded."
  );


  // ----------------------------------------------------------
  // 2. CALENDAR MANAGER
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "2. Creating CalendarManager..."
  );

  const calendar =
    new CalendarManager(
      resources
    );

  Logger.log(
    "CalendarManager created."
  );

  Logger.log(
    "Calendar ID configured: " +
    Boolean(calendar.calendarId)
  );

  Logger.log(
    "Calendar timezone: " +
    calendar.timezone
  );

  Logger.log(
    "Days ahead: " +
    calendar.daysAhead
  );

  Logger.log(
    "Archive days: " +
    calendar.archiveDays
  );


  // ----------------------------------------------------------
  // 3. TEST AUTHENTICATION
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "3. Testing Service Account authentication..."
  );

  const accessToken =
    calendar._getAccessToken_();

  if (!accessToken) {

    throw new Error(
      "TEST FAILED: No Service Account access token returned."
    );
  }

  Logger.log(
    "AUTHENTICATION PASSED"
  );


  // ----------------------------------------------------------
  // 4. CALCULATE TEST DATE
  // ----------------------------------------------------------

  /*
   * Place the test seven days into the future.
   */

  const testDateObject =
    new Date(
      Date.now() +
      (
        7 *
        24 *
        60 *
        60 *
        1000
      )
    );

  const testDate =
    Utilities.formatDate(
      testDateObject,
      calendar.timezone,
      "yyyy-MM-dd"
    );

  Logger.log("");
  Logger.log(
    "Test event date: " +
    testDate
  );


  // ----------------------------------------------------------
  // 5. BUILD TEST EVENT
  // ----------------------------------------------------------

  const testEvent = {

    type:
      "Test",

    title:
      "CalendarManager Integration Test",

    eventTitle:
      "CalendarManager Test",

    description:
      "Temporary event created automatically by CalendarManager integration testing.",

    date:
      testDate,

    startTime:
      "10:00",

    endTime:
      "10:30",

    allDay:
      false,

    location:
      "CalendarManager Test Location",

    address:
      "1 Test Street, Kemptville, ON",

    directions:
      "",

    status:
      "Draft",

    learningTopic:
      "CalendarManager testing",

    learningOutcome:
      "Verify that CalendarManager can read and write Google Calendar events.",

    format:
      "Automated integration test",

    speaker:
      "",

    speakerRole:
      "",

    speakerUrl:
      "",

    image:
      "",

    imageAlt:
      "",

    hoverText:
      "",

    featured:
      false,

    featureStart:
      "",

    featureEnd:
      ""
  };


  // ----------------------------------------------------------
  // 6. CREATE
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "4. Creating test event..."
  );

  const created =
    calendar.add(
      testEvent
    );

  if (!created) {

    throw new Error(
      "TEST FAILED: calendar.add() returned no event."
    );
  }

  if (!created.id) {

    throw new Error(
      "TEST FAILED: Created event has no ID."
    );
  }

  const eventId =
    created.id;

  Logger.log(
    "CREATE PASSED"
  );

  Logger.log(
    "Event ID: " +
    eventId
  );

  Logger.log(
    JSON.stringify(
      created,
      null,
      2
    )
  );


  // ----------------------------------------------------------
  // 7. READ
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "5. Reading created event..."
  );

  const readResult =
    calendar.read(
      eventId
    );

  if (!readResult) {

    throw new Error(
      "TEST FAILED: Unable to read created event."
    );
  }

  if (
    readResult.title !==
    testEvent.title
  ) {

    throw new Error(
      "TEST FAILED: Read title does not match created title."
    );
  }

  if (
    readResult.status !==
    "Draft"
  ) {

    throw new Error(
      "TEST FAILED: Expected status Draft."
    );
  }

  if (
    readResult.state !==
    "Upcoming"
  ) {

    throw new Error(
      "TEST FAILED: Expected state Upcoming."
    );
  }

  Logger.log(
    "READ PASSED"
  );


  // ----------------------------------------------------------
  // 8. UPDATE
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "6. Updating test event..."
  );

  const updatedEvent =
    Object.assign(
      {},
      testEvent,
      {
        title:
          "CalendarManager Integration Test - Updated",

        eventTitle:
          "Updated CalendarManager Test",

        description:
          "This event was successfully updated by CalendarManager.",

        endTime:
          "10:45"
      }
    );

  const updated =
    calendar.update(
      eventId,
      updatedEvent
    );

  if (!updated) {

    throw new Error(
      "TEST FAILED: calendar.update() returned no event."
    );
  }

  if (
    updated.title !==
    "CalendarManager Integration Test - Updated"
  ) {

    throw new Error(
      "TEST FAILED: Updated title was not returned."
    );
  }

  if (
    updated.endTime !==
    "10:45"
  ) {

    throw new Error(
      "TEST FAILED: Updated end time was not returned."
    );
  }

  Logger.log(
    "UPDATE PASSED"
  );


  // ----------------------------------------------------------
  // 9. RE-READ UPDATED EVENT
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "7. Re-reading updated event..."
  );

  const reread =
    calendar.read(
      eventId
    );

  if (!reread) {

    throw new Error(
      "TEST FAILED: Updated event could not be read."
    );
  }

  if (
    reread.title !==
    "CalendarManager Integration Test - Updated"
  ) {

    throw new Error(
      "TEST FAILED: Re-read title does not contain updated value."
    );
  }

  if (
    reread.endTime !==
    "10:45"
  ) {

    throw new Error(
      "TEST FAILED: Re-read endTime does not contain updated value."
    );
  }

  if (
    reread.description !==
    "This event was successfully updated by CalendarManager."
  ) {

    throw new Error(
      "TEST FAILED: Updated description was not returned."
    );
  }

  Logger.log(
    "RE-READ PASSED"
  );


  // ----------------------------------------------------------
  // 10. LIST DRAFT EVENTS
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "8. Testing list()..."
  );

  /*
   * The test event is Draft, so explicitly request Draft events.
   */

  const draftEvents =
    calendar.list({
      state:
        "Upcoming",

      status:
        "Draft"
    });

  const found =
    draftEvents.some(
      event =>
        event.id === eventId
    );

  if (!found) {

    throw new Error(
      "TEST FAILED: Created Draft event was not returned by list()."
    );
  }

  Logger.log(
    "LIST PASSED"
  );


  // ----------------------------------------------------------
  // 11. JSON
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "9. Testing toJSON()..."
  );

  const json =
    calendar.toJSON({
      state:
        "Upcoming",

      status:
        "Draft"
    });

  const parsed =
    JSON.parse(
      json
    );

  if (
    !Array.isArray(parsed)
  ) {

    throw new Error(
      "TEST FAILED: toJSON() did not return a JSON array."
    );
  }

  const jsonFound =
    parsed.some(
      event =>
        event.id === eventId
    );

  if (!jsonFound) {

    throw new Error(
      "TEST FAILED: Test event was not present in JSON output."
    );
  }

  Logger.log(
    "JSON PASSED"
  );


  // ----------------------------------------------------------
  // TEST COMPLETE
  // ----------------------------------------------------------

  Logger.log("");
  Logger.log(
    "========================================"
  );

  Logger.log(
    " ALL TESTS PASSED"
  );

  Logger.log(
    "========================================"
  );

  Logger.log("");

  Logger.log(
    "The test event remains in Google Calendar for manual inspection."
  );

  Logger.log(
    "Event ID: " +
    eventId
  );

  Logger.log(
    "Expected status: Draft"
  );

  Logger.log(
    "Expected state: Upcoming"
  );

  Logger.log(
    "Delete the test event manually when inspection is complete."
  );
}