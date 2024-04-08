export interface Account {
  remote_directories: string[];
  rclone: {
    remote_name: string;
    local_directory: string;
  };
  last_sync_time: string;
}

export interface Config {
  accounts: Account[];
}

export interface NewRCloneRemote {
  url: string;
  username: string;
  password: string;
  name: string;
  local_directory: string;
  remote_directories: string[];
}

export interface Directory {
  directory_name: string;
}
