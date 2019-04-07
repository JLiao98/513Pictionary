let app = require('express')();
let express = require('express');
let server = require('http').Server(app);
let MongoClient = require('mongodb').MongoClient;


let users = {};
let rooms = [];
let roomInfo = {};
let categories = [];
let categoryTypes = [];
let categoryToWords = {};


app.use('/assets', express.static(__dirname + '/dist'));
const io = require('socket.io')(server);



// connect to mongo and store all categories w/ answers in categories list
const uri = 'mongodb+srv://513Administrator:zAiKscXwdMZaX7FP@513cluster-qiybs.mongodb.net/test?retryWrites=true';
const client = new MongoClient(uri, { useNewUrlParser: true });


// var url1 = 'mongodb+srv://513Administrator:zAiKscXwdMZaX7FP@513cluster-qiybs.mongodb.net/test?retryWrites=true';
// var client1 = new MongoClient(uri, { useNewUrlParser: true });

// getting all categories from database
client.connect(err => {
	const collection = client.db('pictionary').collection('categories');
	let rawCategories = collection.find().toArray((err, items) => {
		categories = items;
		items.forEach(function(arrayItem) {
			categoryTypes.push(arrayItem.type);
			categoryToWords[arrayItem.type] = arrayItem[arrayItem.type];
		});
	});

	client.close();
});

let getUsers = () => {
	return Object.keys(users).map(function(key) {
		return users[key].username;
	});
};



// --------- Helper functions for chat message -------------------//
let createSocket = (user) => {
	let current_user = users[user.id],
		updated_user = {
			[user.id]: Object.assign(current_user, { sockets: [...current_user.sockets, user.socket_id] })
		};
	users = Object.assign(users, updated_user);
};

let createUser = (user) => {
	users = Object.assign({
		[user.id]: {
			username: user.username,
			id: user.id,
			sockets: [user.socket_id]
		}
	}, users);
};

let removeSocket = (socket_id) => {
	let id = '';
	Object.keys(users).map(function(key) {
		let sockets = users[key].sockets;
		if (sockets.indexOf(socket_id) !== -1) {
			id = key;
		}
	});
	let user = users[id];
	if (user.sockets.length > 1) {
		let index = user.sockets.indexOf(socket_id);
		let updated_user = {
			[id]: Object.assign(user, {
				sockets: user.sockets.slice(0, index).concat(user.sockets.slice(index + 1))
			})
		};
		users = Object.assign(users, updated_user);
	} else {
		let cuser = Object.assign({}, users);
		delete cuser[id];
		users = cuser;
	}
};



// ------------------- helper function for admin page -----------------//

//store new category and word
let storeCategoryAndWord = (data) => {
	let clientDriver = new MongoClient(uri, { useNewUrlParser: true });
	clientDriver.connect(err => {

		const collection = clientDriver.db('pictionary').collection('categories');
		let type = data.category;
		let word = data.word;
		var obj = { type: type, [type]: word };

		collection.insertOne(obj, function(err, res) {
			if (err) throw err;
		});
	});

	clientDriver.close();
};


let addWordToExistingCategory = (data) => {
	let clientDriver = new MongoClient(uri, { useNewUrlParser: true });
	clientDriver.connect(err => {

		const collection = clientDriver.db('pictionary').collection('categories');
		let type = data.category;
		let word = data.word;
		var obj = { type: type};

		console.log(obj)
		collection.updateOne(
			{obj},
			{$addToSet : {[type]: word}}, function(err, res)  {
				if (err) throw err;
			}
		);

	});

	clientDriver.close();
};



//---------------- general helper functions -------------------------//
let getUniqueId = function() {
	// Math.random should be unique because of its seeding algorithm.
	// Convert it to base 36 (numbers + letters), and grab the first 9 characters
	// after the decimal.
	return '_' + Math.random().toString(36).substr(2, 9);
};

//########----------- on socket connection --------------------###########/
io.on('connection', (socket) => {


	socket.on('init-chat', (query) =>
	{
		//let query = socket.request._query,
			user = {
				username: query.username,
				id: query.id,
				socket_id: socket.id
			};

		//If incoming user connection is new, create a new user id and username
		// otherwise, use the fetched data and update the userlist
		if (users[user.id] !== undefined) {
			// console.log("USER ID: " + user.id);
			// console.log("Users list: " + users[user.id]);
			createSocket(user);
			socket.emit('updateUsersList', getUsers());
		} else {
			// console.log("Creating new user: " + user + " with id of: " + user.id);
			createUser(user);
			io.emit('updateUsersList', getUsers());
		}
	});

	socket.on('subscribeToTimer', (interval) => {
		console.log('client is subscribing to timer with interval ', interval);
		setInterval(() => {
			socket.emit('timer', new Date());
		}, interval);
	});



	//------------------------- Cynthis -------------------------//


	socket.on('new_loginfo', (info) => {
		console.log('login req');

		var client1 = new MongoClient(uri, { useNewUrlParser: true });

		client1.connect(err => {
			const collection = client1
				.db('pictionary')
				.collection('users');

			var myobj = { email: info.email, password: info.psw };

			collection
				.find(myobj)
				.toArray(function(err, res) {
					if (res && res.length !== 0) {
						if (res[0].isAdmin === '1') {
							console.log('admin logged in');
							socket.emit('login_flag', {type:'admin', username: res[0].username});
						} else if (res[0].isAdmin === '0') {
							socket.emit('login_flag', {type:'user', username: res[0].username});
							console.log('uesr logged in');
						}
					} else {
						socket.emit('login_flag', {type:'fail'});
						console.log('failure');
					}
				});
		});

	});


	//------------------------- Cynthis -------------------------//

	//---------------------------- creating and join room -----------------------------------------//


    //lets socket join a room or create one if it doesn't exist
    //keep track of current rooms
    //in socket io, join and create room are a single function
    socket.on('join-room', function (data) {
        let roomsearch = io.sockets.adapter.rooms[data.room.id];
        console.log("inside join room");
        console.log(roomsearch);
        if(rooms.includes(data.room.id)) {
            if (roomsearch && roomsearch.length < 5) {
                socket.join(data.room.id);
                data.room.capacity = roomsearch.length + '/5';
                console.log("joined successfully in existing room")
            } else if (!roomsearch){
                socket.join(data.room.id);
                data.room.capacity =  1 + '/5';
                console.log("joined successfully first time")
            } else{
                data.room.capacity = roomsearch.length + '/5';
                socket.emit('full room', "Room is full");
            }
        }


		// socket.broadcast.to(data.room.id).emit('message',
		// 	{type:'message', text: data.username + " just joined the room!"});


        roomInfo[data.room.id] = data.room;

        // to update capacity all sockets
        io.emit('updateRoomInfo', data.room)

    });


    //not actually joining the room, creating an entry in the list
    socket.on('create-room', function (room) {
        let roomId = getUniqueId();
        while (rooms.includes(roomId)) {
            roomId = getUniqueId();
        }

        rooms.push(roomId);

        room.id = roomId;
        room.capacity = 0 + '/5';

       // socket.join(roomId)
        roomInfo[room.id] = room;
        console.log("created new room " + roomId);

        socket.emit('sendRoomInfo', room);
		socket.broadcast.emit('newRoom', room);

    });


    //get all the rooms
    socket.on('room-list', function (data) {

        let roomList = [];
        for (var key in roomInfo){
            roomList.push(roomInfo[key])
        }

        socket.emit('all-rooms', roomList);
    });

	socket.on('leave-room', function (data) {

		let roomsearch = io.sockets.adapter.rooms[data.id];
		let room = roomInfo[data.id];
		if(roomsearch){
			room.capacity = roomsearch.length -1 + '/5' ;
			roomInfo[data.id] = room;
		}
		socket.leave(data.id);

		socket.emit('sendRoomInfo', room)

	});


    //-------------------------------------------------------------------------------------//



	///---------------------- GAME ROOM ACTIVITY NEED TO HAPPEN WITH socket room------------------////


	socket.on('newStrokeSnd', (data) => {
		// probably change to broadcasting to a room, if we still want multiple rooms
		//socket.broadcast.emit('newStrokeRcv', data.item);

		//broadcasting to everyone in room
		socket.broadcast.to(data.roomId).emit('newStrokeRcv', data.item);
	});


	//emits message to all users in the room
    //add functionality to verify answer on each message receive
    socket.on('message', function (data) {


		console.log("room id passed in : " +  data.roomId);

		console.log(socket.id);
		let roomsearch = io.sockets.adapter.rooms[data.roomId];
		console.log(roomsearch);


		//to room sockets
		let rooms = Object.keys(socket.rooms);
		console.log(rooms); // [ <socket.id>, 'room 237' ]

		//io.in(data.roomId).emit('message', data);

		socket.broadcast.to(data.roomId).emit('message', data);
     // socket.broadcast.emit('message', data);
        //TODO - add function to check message with answer
    });


	// //emits message to all users in the room
	// //add functionality to verify answer on each message receive
	// socket.on('message', function(msg) {
	// 	// io.in(room).emit('message',msg);
	//
	// 	socket.broadcast.to(msg.roomId).emit('message', msg.msq);
	//
	// 	//socket.broadcast.emit('message', msg);
	// 	//TODO - add function to check message with answer
	// });


	//Receives image from socket and emits to all other sockets in that room
	// socket.on('receive image', function (image) {
	//     socket.broadcast.to(room).emit(image);
	// });

	//Handles socket disconnection and possible room deletion when disconnecting socket is last one in room
	//Updates users list on user disconnect
	socket.on('disconnect', () => {
	//	removeSocket(socket.id);
		io.emit('updateUsersList', getUsers());
	});

	//---------------- Admin page --------------------//

	//this is for testing right now, need to fetch from DB
	socket.on('categories', (data) => {
		let cats = [];
		categories.forEach(function(arrayItem) {
			cats.push(arrayItem.type);
		});

		socket.emit('categories', cats);
	});

	socket.on('newCategoryCheck', (data) => {
		if (categoryTypes.includes(data.toLowerCase())) {
			socket.emit('newCategoryFail', { error: 'Category Already Exists' });
		}
	});

	socket.on('storeNewCategory', (data) => {
		console.log(data);
		if (data.existingCategory) {
			if (!categoryToWords[data.existingCategory].includes(data.word)) {
				console.log(data.word);
				addWordToExistingCategory({category: data.existingCategory, word: data.word});
			}
		} else {
			storeCategoryAndWord({ category: data.newCategory, word: data.word });
		}
	});

	// -----------------  Dashboard ---------------------------//

});

const port = process.env.port || 8000;
io.listen(port);
console.log('listening on port ', port);
