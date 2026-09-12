# Servitor WIP 🚧

Servitor 3.0
    Establish DataBasing
        Members w/roles DataBasing (Complete)
        Nominations DataBasing (Complete)
            
Servitor 3.1
    VC Refactor
        Create various permanant static VCs
        Create command panel options (Likely one text channel with command panel per category will work best)
            Commands
                Rename
                    Needs to return to default name when last member leaves the channel.
                Timestamp
                    Input discord formated time code to set channel status with a Timestamp - primary use for upcoming events
                Limit occupancy
                Temporary sub channel creation for team or comms options
        Remove current Temporary VCs
        Cancel remove Voicemaster+ bot
        Make temp vc Function for the Servitor to maintain 1 remaining temp vc generator

Fix Discipline message not sending to the proper discipline text channel when a primary discipline is selected.        
    
Servitor 3.2    
    Category Consolidation & VC Refactor channel list - only altered categories are listed to reflect proposed changes
        Public Square
            general chat
            star citizen chat
            want to fight
            generalmedia
            sc media
            bv media
            pet gallery
            ttrpg talk
            org verification
            representative general
            Public VC (temp vc generator) 
            Public AC 
            Warhammer
            Representative VC

        representative's courtyard - Remove

        BlightVeil Barracks
            bv general
            rate my flight
            salt mine
            sus memes
            pilot
            infantry
            crewman
            tradesman
            knights general
            BV VC
            BV Ops I
            BV Ops II
            BVK VC
            Squadron Battles
            PvP Party
            FPS Training
            Ram-Ranch BAR 

        Knights Barracks - Remove

        Leaders Hall
            BV Leader VC

        Council Chamber (rename Command & Control to fit the BV theme better)
            Council VC
        
        Move rank control to Librarium

        Staff Workshop (new category to replace seperate staff role categories)
            Herald VC
            Chamberlain VC
            Scholars VC

Servitor 4.0
    Complete code restructuring into feature categories
        server.js
        features
            'Function'.js (onboarding, deathwatch, etc.)
                include all interactions, commands, data etc for each feature/Function in one .js 
    Assess other applicable DataBasing requirments
        Transcripts
        New member applicaitons
        FAQ Documents



Container/
├── bot.js                      # Main bot entry point
├── core/                       # Core functionalities (shared by all features)
│   ├── config.js               # Configuration for the bot
│   ├── logger.js               # Logging setup
│   └── database.js             # Database connection logic
├── features/                   # Folder containing feature modules
│   ├── Onboarding/             # Onboarding feature
│   │   ├── commands/           # Onboarding-specific commands
│   │   ├── interactions/       # Onboarding-specific interactions (buttons, forms)
│   │   └── data/               # Onboarding-specific data (storage or settings)
│   ├── Moderation/             # Moderation feature
│   │   ├── commands/           # Moderation-specific commands
│   │   ├── interactions/       # Moderation-specific interactions
│   │   └── data/               # Moderation-specific data
│   └── Fun/                    # Fun feature (memes, jokes, etc.)
│       ├── commands/           # Fun-related commands
│       ├── interactions/       # Fun-related interactions
│       └── data/               # Fun-related data
├── .env                        # Environment variables (bot token, etc.)
├── package.json                # Node.js dependencies
└── README.md                   # Documentation

    feature check list 
    -    ServerEntry
    -    BVonboarding
    -    Nomination
    -    Commendation
    -    NicknameChange
    -    Ambassadorship
    -    Staff
    -    Instructor
    -    Deathwatch
    -    LootGoblins
    -    Giveaway
    -    Admin 
    -    Discipline
    -    ActionLog


Container
    server.js
    core/
        config.js
        logger.js
        database.js
    features/
        ServerEntry/
            ServerEntryCommand
            ServerEntryConfig
            ServerEntryInteraction
        BVonboard/
            BVonboardCommand
            BVonboardInteraction
        Nomination/
            NominationCommand
            NominationDB
            NominationInteraction
        Commendation/
            CommendationCommand
            CommendationInteraction
        NicknameChange/
            NicknameChangeCommand
            NicknameChangeInteraction
        Ambassadorship/
            AmbassadorshipCommand
            AmbassadorshipInteraction
        BVstaff/
            BVStaffCommand
            BVstaffInteraction
        BVinstructor/
            BVinstructorCommand
            BVinstructorInteraction
        Deathwatch/
            DeathwatchCommand
            DeathwatchInteraction
        LootGoblins/
            LootGoblinsCommand
            LootGoblinsInteraction
        Giveaway/
            GiveawayCommand
            GiveawayInteraction
        Admin/
            AdminCommand
            BVmemberDB
        Discipline/
            DisciplineCommand
            DisciplineInteraction
        ActionLog/
            ActionLogEvent
