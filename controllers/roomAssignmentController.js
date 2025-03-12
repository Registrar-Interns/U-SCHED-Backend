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
          COALESCE(c.college_code, '') AS department,  -- Handles NULL values
          r.floor_number AS floor
      FROM room r
      JOIN building b ON r.building_id = b.building_id
      LEFT JOIN college c ON r.college_code = c.college_code -- Ensures rooms without departments are included
      ORDER BY b.building_name, r.floor_number, r.room_number;
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
    const roomTypes = ["Lecture Room", "Laboratory"]; // Room Type ENUM

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
  const { building_id, room_type } = req.params;

  try {
    let query = `
      SELECT room_number FROM room 
      WHERE building_id = ? 
      ORDER BY room_number DESC LIMIT 1
    `;

    // If the room type is "GYM", reset numbering to 1
    if (room_type === "GYM") {
      return res.json({ room_number: 1 });
    }

    const [lastRoom] = await db.promise().query(query, [building_id]);

    const newRoomNumber = lastRoom.length > 0 ? parseInt(lastRoom[0].room_number) + 1 : 1;
    res.json({ room_number: newRoomNumber });
  } catch (error) {
    console.error("Error fetching latest room number:", error);
    res.status(500).json({ error: "Failed to fetch latest room number" });
  }
};
exports.addRoom = async (req, res) => {
  const { building_id, room_type, status, college_code, floor_number } = req.body;

  try {
    const conn = await db.promise().getConnection();

    let newRoomNumber = 1; // Default starting number for GYM

    if (room_type !== "GYM") {
      // Fetch last room number in the selected building
      const [lastRoom] = await conn.query(
        "SELECT room_number FROM room WHERE building_id = ? ORDER BY room_number DESC LIMIT 1",
        [building_id]
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

  const validRoomTypes = ["Lecture Room", "Laboratory", "GYM"];
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
      return res.status(400).json({ error: "Invalid room_type. Allowed: Lecture Room, Laboratory." });
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
