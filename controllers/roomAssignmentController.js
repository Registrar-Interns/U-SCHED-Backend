const db = require("../db");

// ✅ Fetch all rooms with proper JOIN handling
exports.getRooms = async (req, res) => {
  try {
    const query = `
       SELECT 
          r.room_id AS id, 
          r.room_number, 
          b.building_name AS building, 
          r.room_type AS type, 
          r.status, 
          COALESCE(c.college_code, '') AS department,
          r.floor_number AS floor
      FROM room r
      JOIN building b ON r.building_id = b.building_id
      LEFT JOIN college c ON r.college_code = c.college_code
      ORDER BY 
          CASE 
              WHEN b.building_name = 'Main Building' THEN 1
              WHEN b.building_name = 'Bagong Cabuyao Hall' OR b.building_name = 'BCH' THEN 2
              ELSE 3
          END,
          b.building_name,
          r.room_type,
          r.room_number;
    `;

    const [rooms] = await db.promise().query(query);
    res.json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

// ✅ Fetch room status, departments, room types, and buildings
exports.getRoomOptions = async (req, res) => {
  try {
    const statuses = ["Available", "Occupied", "Out of Order"];
    const roomTypes = ["Lecture Room", "Laboratory Room", "GYM", "Computer Laboratory"]; // Room Type ENUM

    // ✅ Fetch Departments
    const [departments] = await db.promise().query(
      "SELECT college_code AS value, college_name AS label FROM college WHERE college_name NOT LIKE '%General Education%'"
    );

    // ✅ Fetch Buildings (This was missing)
    const [buildings] = await db.promise().query(
      "SELECT building_id AS value, building_name AS label FROM building ORDER BY building_name"
    );

    res.json({
      statuses,
      roomTypes,
      departments,
      buildings, // ✅ Buildings now included
    });
  } catch (error) {
    console.error("Error fetching dropdown options:", error);
    res.status(500).json({ error: "Failed to fetch dropdown options" });
  }
};

exports.getLatestRoomNumber = async (req, res) => {
  const { building_id } = req.params;
  let { room_type } = req.params;  
  
  // Decode the room_type parameter
  room_type = decodeURIComponent(room_type);
    
  try {
    // Both building_id and room_type are required
    if (!building_id || !room_type) {
      return res.status(400).json({ error: "Building ID and Room Type are required" });
    }

    // Get building information to determine its type
    const [buildingInfo] = await db.promise().query(
      "SELECT building_name FROM building WHERE building_id = ?", 
      [building_id]
    );
    
    if (buildingInfo.length === 0) {
      return res.status(400).json({ error: "Invalid building ID" });
    }
    
    const buildingName = buildingInfo[0].building_name;

    // For GYM and Computer Laboratory rooms
    if (room_type === "GYM" || room_type === "Computer Laboratory") {
      // Get latest room number for this specific building and room type
      const [lastRoom] = await db.promise().query(
        "SELECT room_number FROM room WHERE building_id = ? AND room_type = ? ORDER BY room_number DESC LIMIT 1",
        [building_id, room_type]
      );
      
      const newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : 1;
      return res.json({ room_number: newRoomNumber });
    }

    // For Lecture Rooms and Laboratory Rooms, get the latest number for THIS SPECIFIC BUILDING
    if (room_type === "Lecture Room" || room_type === "Laboratory Room") {
      // Get latest room number for this specific building and room type
      const [lastRoom] = await db.promise().query(
        "SELECT room_number FROM room WHERE building_id = ? AND room_type = ? ORDER BY room_number DESC LIMIT 1",
        [building_id, room_type]
      );
      
      // Set starting numbers based on building
      let startingNumber;
      if (buildingName === "Main Building") {
        startingNumber = 101;
      } else if (buildingName === "Bagong Cabuyao Hall" || buildingName === "BCH") {
        startingNumber = 201;
      } else {
        startingNumber = 101; // Default for other buildings
      }
      
      const newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : startingNumber;
      return res.json({ room_number: newRoomNumber });
    }

    // Default logic for other cases
    let query = `
      SELECT room_number FROM room 
      WHERE building_id = ? AND room_type = ?
      ORDER BY room_number DESC LIMIT 1
    `;

    const [lastRoom] = await db.promise().query(query, [building_id, room_type]);

    const newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : 1;
    res.json({ room_number: newRoomNumber });
  } catch (error) {
    console.error("Error fetching latest room number:", error);
    res.status(500).json({ error: "Failed to fetch latest room number" });
  }
};

exports.addRoom = async (req, res) => {
  const { building_id, room_type, status, college_code, floor_number, room_number } = req.body;

  try {
    const conn = await db.promise().getConnection();

    // If room_number is provided in the request, use it
    // This allows manual override if needed
    if (room_number) {
      await conn.query(
        "INSERT INTO room (room_number, building_id, room_type, status, college_code, floor_number) VALUES (?, ?, ?, ?, ?, ?)",
        [room_number, building_id, room_type, status, college_code || null, floor_number]
      );
      
      conn.release();
      return res.json({ message: "Room added successfully", room_number });
    }

    // Get building information to determine its type
    const [buildingInfo] = await conn.query(
      "SELECT building_name FROM building WHERE building_id = ?", 
      [building_id]
    );
    
    if (buildingInfo.length === 0) {
      conn.release();
      return res.status(400).json({ error: "Invalid building ID" });
    }
    
    const buildingName = buildingInfo[0].building_name;
    let newRoomNumber = 1; // Default starting number

    if (room_type === "GYM" || room_type === "Computer Laboratory") {
      // Get latest room number for this building and room type
      const [lastRoom] = await conn.query(
        "SELECT room_number FROM room WHERE building_id = ? AND room_type = ? ORDER BY room_number DESC LIMIT 1",
        [building_id, room_type]
      );
      
      newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : 1;
    } else if (room_type === "Lecture Room" || room_type === "Laboratory Room") {
      // Use building-specific numbering scheme
      // Get the latest room number for THIS building only
      const [lastRoom] = await conn.query(
        "SELECT room_number FROM room WHERE building_id = ? AND room_type = ? ORDER BY room_number DESC LIMIT 1",
        [building_id, room_type]
      );
      
      // Set starting numbers based on building
      let startingNumber;
      if (buildingName === "Main Building") {
        startingNumber = 101;
      } else if (buildingName === "Bagong Cabuyao Hall" || buildingName === "BCH") {
        startingNumber = 201;
      } else {
        startingNumber = 101; // Default for other buildings
      }
      
      newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : startingNumber;
    } else {
      // For other cases, follow standard numbering
      const [lastRoom] = await conn.query(
        "SELECT room_number FROM room WHERE building_id = ? AND room_type = ? ORDER BY room_number DESC LIMIT 1",
        [building_id, room_type]
      );
      newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : 1;
    }

    await conn.query(
      "INSERT INTO room (room_number, building_id, room_type, status, college_code, floor_number) VALUES (?, ?, ?, ?, ?, ?)",
      [newRoomNumber, building_id, room_type, status, college_code || null, floor_number]
    );

    conn.release();
    res.json({ message: "Room added successfully", room_number: newRoomNumber });
  } catch (error) {
    console.error("Error adding room:", error);
    res.status(500).json({ error: "Failed to add room" });
  }
};

// ✅ Update Room (Status & College Code Updates)
exports.updateRoom = async (req, res) => {
  const { id } = req.params;
  const { status, room_type, college_code } = req.body;

  const validRoomTypes = ["Lecture Room", "Laboratory Room", "GYM", "Computer Laboratory"];
  const validStatuses = ["Available", "Occupied", "Out of Order"];

  try {
    const conn = await db.promise().getConnection();

    // ✅ Validate Room Exists
    const [room] = await conn.query("SELECT * FROM room WHERE room_id = ?", [id]);
    if (room.length === 0) {
      conn.release();
      return res.status(404).json({ error: "Room not found" });
    }

    // ✅ Validate Status
    if (!validStatuses.includes(status)) {
      conn.release();
      return res.status(400).json({ error: "Invalid status. Allowed: Available, Occupied, Out of Order." });
    }

    // ✅ Validate Room Type if provided
    if (room_type && !validRoomTypes.includes(room_type)) {
      conn.release();
      return res.status(400).json({ error: "Invalid room_type. Allowed: Lecture Room, Laboratory Room, GYM, Computer Laboratory" });
    }

    // ✅ Validate College Code (Only if status is "Occupied")
    if (status === "Occupied" && college_code) {
      const [college] = await conn.query("SELECT * FROM college WHERE college_code = ?", [college_code]);
      if (college.length === 0) {
        conn.release();
        return res.status(400).json({ error: "Invalid college_code. College does not exist." });
      }
    }

    // ✅ Update Room Details
    await conn.query(
      "UPDATE room SET status = ?, room_type = ?, college_code = ? WHERE room_id = ?",
      [status, room_type || room[0].room_type, college_code || null, id]
    );

    conn.release();
    res.json({ message: "Room updated successfully" });
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ error: "Failed to update room" });
  }
};