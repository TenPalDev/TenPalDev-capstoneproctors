import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Button, Modal, Pressable, TextInput, FlatList, TouchableOpacity, Alert } from 'react-native';
import ZegoUIKitPrebuiltVideoConference, { MyForegroundView, ZegoMenuBarButtonName,ZegoVideoView } from '@zegocloud/zego-uikit-prebuilt-video-conference-rn'
import { ZegoLayoutMode, ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-rn'
import KeyCenter from './keyCenter';
import Entypo from 'react-native-vector-icons/Entypo';
import ZegoExpressEngine, { ZegoVideoSourceType } from 'zego-express-engine-reactnative';
import io from 'socket.io-client'

export default function VideoConferencePage(props) {
  const { route } = props;
  const { params } = route;
  const { userId, user, roomId, roomName } = params;
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [addUserModalVisible, setAddUserModalVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [mutedMembers, setMutedMembers] = useState([]);
  const [showMicrophoneState, setShowMicrophoneState] = useState(false);
  const [showCameraState, setShowCameraState] = useState(false);
  const firstname = user.firstname;
  const lastname = user.lastname;
  useEffect(() => {
    const socketInstance = io('http://192.168.56.1:8000/');
    setSocket(socketInstance);
    socketInstance.on('connect', () => {
      console.log('Connected to server');
      socketInstance.emit('joinRoom', roomName);
    });
    socketInstance.on('connect_error', (error) => {
      console.error('Socket.io connection error:', error);
    });
    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }, []);

  const toggleScreenSharing = async () => {
    if (!isScreenSharing) {
      // Start screen sharing
      await ZegoExpressEngine.instance().startScreenCapture();
      await ZegoExpressEngine.instance().setVideoSource(ZegoVideoSourceType.ScreenCapture, ZegoPublishChannel.Aux);
      setIsScreenSharing(true);
      console.log("screening");
    } else {
      // Stop screen sharing
      await ZegoExpressEngine.instance().stopScreenCapture();
      await ZegoExpressEngine.instance().setVideoSource(ZegoVideoSourceType.Camera, ZegoPublishChannel.Aux);
      setIsScreenSharing(false);
    }
  };

  const toggleModal = () => {
    setIsModalVisible(!isModalVisible);
  };

  const handleSearch = async () => {
    try {
      const response = await fetch(`http://192.168.56.1:8000/search-users?searchTerm=${searchTerm}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const addUserToRoom = () => {
    if (selectedUser) {
      socket.emit('addUserToRoom', { userId: selectedUser._id, roomName });
      setAddUserModalVisible(false);
      setSelectedUser(null);
    }
  };
  return (
    <View style={styles.container}>
      <ZegoUIKitPrebuiltVideoConference
        appID={KeyCenter.appID}
        appSign={KeyCenter.appSign}
        userID={userId}
        userName={firstname}
        conferenceID={roomId}
        config={{

          onLeave: () => { props.navigation.navigate('Rooms') },
          onLeaveConfirmation: () => {
            return new Promise((resolve, reject) => {
              Alert.alert(
                "Leave the conference",
                "Are you sure to leave the conference?",
                [
                  {
                    text: "Cancel",
                    onPress: () => reject(),
                    style: "cancel"
                  },
                  {
                    text: "Exit",
                    onPress: () => resolve()
                  }
                ]
              );
            })
          },
          memberListConfig: {
            itemBuilder: () => {
              return (
                <TouchableOpacity>
                <View style={styles.memberItem}>
                  <Text style={styles.memberName}>{firstname} {lastname}</Text>
                </View>
                </TouchableOpacity>
              );
            },
          },
          bottomMenuBarConfig: {
            maxCount: 5,
            buttons: [
              ZegoMenuBarButtonName.toggleCameraButton,
              ZegoMenuBarButtonName.toggleMicrophoneButton,
              ZegoMenuBarButtonName.leaveButton,
              ZegoMenuBarButtonName.switchAudioOutputButton,
              ZegoMenuBarButtonName.switchCameraButton,
            ],
            extendButtons: [
              <Entypo
                name="share-alternative"
                size={20}
                color="white"
                style={{ marginBottom: 15, marginLeft: 20 }}
                onPress={toggleScreenSharing}

              />,
              <Entypo
                name="add-user"
                size={20}
                color="white"
                style={{ marginBottom: 15, marginLeft: 20 }}
                onPress={() => setAddUserModalVisible(true)}
              />,
              <Entypo
                name="blackboard"
                size={20}
                color="white"
                style={{ marginBottom: 15, marginLeft: 20 }}
                onPress={() => setIsModalVisible(true)}
              />,
            ],
          },
          layout: {
            mode: ZegoLayoutMode.gallery,
            showScreenSharingFullscreenModeToggleButtonRules: 'alwaysShow',
            showNewScreenSharingViewInFullscreenMode: false,
            addBorderRadiusAndSpacingBetweenView: false
          },
          // Add the shared screen as a video view
        }}
      />
      <Text style={styles.roomNameText}>{roomName}</Text>
      <Modal
        animationType="slide"
        transparent={true}
        visible={addUserModalVisible}
        onRequestClose={() => {
          setAddUserModalVisible(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.addUserModalContent}>
            <TextInput
              style={styles.input}
              placeholder="Search users..."
              onChangeText={(text) => setSearchTerm(text)}
              value={searchTerm}
            />
            <Button title="Search" onPress={handleSearch} />
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => handleUserSelection(item)}>
                  <Text style={styles.searchResult}>{`${item.firstname} ${item.lastname} - ${item.email}`}</Text>
                </TouchableOpacity>
              )}
            />
            {selectedUser && (
              <View style={styles.buttonContainer}>
                <Button title="Add User" onPress={addUserToRoom} />
              </View>
            )}
            <View style={styles.buttonContainer}>
              <Button title="Cancel" onPress={() => setAddUserModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Updated styles for the modal and its content
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    position: 'relative',
  },
  roomNameText: {
    position: 'absolute',
    top: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    fontSize: 18,
    fontWeight: 'bold',
    color: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Ensure room name text appears above the modal
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent background
    zIndex: 2, // Ensure modal appears above other content
  },
  addUserModalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 40,
    width: '100%',
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  buttonContainer: {
    marginTop: 10,
    width: '100%',
  },
  searchResult: {
    fontWeight: 'bold',
    color: 'black',
    marginBottom: 5,
  },
  memberItem: {
    backgroundColor: '#333333',
    borderRadius: 5,
    padding: 10,
    marginHorizontal: 5,
    marginVertical: 3,
  },
  memberName: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
