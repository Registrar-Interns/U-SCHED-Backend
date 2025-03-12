const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomAssignmentController");

// ✅ Fetch all rooms
router.get("/", roomController.getRooms);

// ✅ Fetch room options (statuses, departments, room types, and buildings)
router.get("/room-options", roomController.getRoomOptions);

// ✅ Fetch latest room number for a selected building
router.get("/latest-room/:building_id", roomController.getLatestRoomNumber);

// ✅ Add a new room (Automatically assigns the next room number)
router.post("/", roomController.addRoom);

// ✅ Update an existing room
router.put("/:id", roomController.updateRoom);

module.exports = router;
